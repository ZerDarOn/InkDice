"""Recover character-option prose from user-provided CHM HTML, including node tails.

Only existing 5E compendium references are changed. A hash-gated repair manifest
allows desktop upgrades to apply identical corrections without overwriting edits.
"""
import argparse
import hashlib
import json
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from lxml import html


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def decode(data):
    for encoding in ('utf-8-sig', 'gb18030', 'utf-16'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise ValueError('Source encoding could not be decoded losslessly')


def normalize(text):
    return re.sub(r'\s+', ' ', text).strip()


def extract_html(data):
    doc = html.fromstring(decode(data))
    for node in doc.xpath('//script|//style|//noscript|//object|//embed|//*[@id="winchm_template_navigation" or @id="winchm_template_button" or @id="winchm_template_footer"]'):
        node.drop_tree()
    body = doc.find('body')
    if body is None:
        body = doc
    chunks = []
    headings = []

    def emit(text):
        if text:
            chunks.append(text.replace('\xa0', ' '))

    def walk(node):
        if not isinstance(node.tag, str):
            return
        tag = node.tag.lower()
        text = normalize(''.join(node.itertext()))
        if tag == 'br':
            emit('\n')
            return
        if tag in ('img', 'input', 'link', 'meta'):
            return
        if tag == 'table':
            rows = [[normalize(' '.join(cell.itertext())) for cell in tr.xpath('./td|./th')] for tr in node.xpath('.//tr')]
            rows = [row for row in rows if any(row)]
            if rows:
                width = max(map(len, rows))
                emit('\n\n')
                for i, row in enumerate(rows):
                    emit('| ' + ' | '.join(s.replace('|', '\\|') for s in row + [''] * (width-len(row))) + ' |\n')
                    if i == 0:
                        emit('| ' + ' | '.join(['---'] * width) + ' |\n')
                emit('\n')
            return
        # CHM pages often use STRONG/FONT instead of semantic headings.
        line_start = not chunks or not ''.join(chunks).rsplit('\n', 1)[-1].strip()
        colored = any(str(n.get('color', '')).lower() in ('#800000', 'maroon', '#990000') for n in node.iter())
        bold_title = tag in ('strong', 'b') and len(text) <= 120 and not re.search(r'[。！？]', text) and (line_start or colored)
        semantic = bool(re.fullmatch(r'h[1-6]', tag))
        if (bold_title or semantic) and text:
            emit('\n\n#### ' + text + '\n\n')
            headings.append(text)
            return
        block = tag in ('p', 'div', 'section', 'blockquote', 'li', 'pre', 'ul', 'ol')
        if block:
            emit('\n\n')
        emit(node.text)
        for child in node:
            walk(child)
            emit(child.tail)  # Critical: old extractor discarded text following tables/BRs.
        if block:
            emit('\n\n')

    walk(body)
    markdown = ''.join(chunks).replace('\r', '')
    markdown = re.sub(r'[ \t]+', ' ', markdown)
    markdown = re.sub(r'\n[ \t]+', '\n', markdown)
    markdown = re.sub(r'\n{3,}', '\n\n', markdown).strip()
    # Independent plain-text traversal: prose must not disappear in Markdown rendering.
    plain = normalize(' '.join(body.itertext()))
    return markdown, plain, headings


def repair(root, database, report_path, apply=False):
    db = sqlite3.connect(database)
    db.row_factory = sqlite3.Row
    report = {'revision': 'feature-html-v1', 'apply': apply, 'recovered': [], 'missing': [], 'emptyPages': []}
    rows = db.execute("SELECT * FROM library_entries WHERE ruleset='dnd5e-2014' AND kind='reference' AND source_id LIKE 'compendium-5e-%'").fetchall()
    changes = []
    for row in rows:
        payload = json.loads(row['payload_json'])
        if not (re.search(r'职业|种族|族裔|角色选项|角色创建|玩家选项|玩家可用种族|/龙纹/|拉尼卡公会指南重置版/牛头人\.|星界冒险者指南/(?:流浆体|自动侏儒|螳螂人|诘弗人|鼯猴人)\.|子职|(?:圣武士|牧师|术士|邪术师|吟游诗人|游侠|武僧|法师|战士)[-：]', row['source_sheet']) or payload.get('分类') in ('职业', '种族与族裔', '其他角色选项')):
            continue
        filename = (root / row['source_sheet']).resolve()
        if not filename.is_relative_to(root.resolve()):
            raise ValueError('Source path escapes CHM root')
        if not filename.is_file():
            report['missing'].append(row['source_sheet'])
            continue
        data = filename.read_bytes()
        markdown, plain, headings = extract_html(data)
        if not markdown:
            report['emptyPages'].append(row['source_sheet'])
            continue
        old = payload.get('正文', '')
        source_hash = hashlib.sha256(data).hexdigest()
        if payload.get('正文修复', {}).get('sourceSha256') == source_hash and payload.get('正文修复', {}).get('revision') == report['revision']:
            continue
        payload.update({'正文': markdown, '原始正文文本': plain, '原始标题': headings,
                        '正文修复': {'revision': report['revision'], 'sourceSha256': source_hash, 'previousBodySha256': digest(old), 'method': 'DOM text and tails; BR and table boundaries preserved'}})
        updated = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        changes.append((row['id'], digest(row['payload_json']), digest(updated), updated))
        report['recovered'].append({'id': row['id'], 'path': row['source_sheet'], 'before': len(old), 'after': len(markdown), 'headings': len(headings), 'sourceSha256': source_hash})
    if apply and changes:
        backup = str(database) + '.' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.feature-repair.bak'
        shutil.copy2(database, backup)
        report['backup'] = backup
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS library_content_repairs (entry_id TEXT PRIMARY KEY, before_hash TEXT NOT NULL, after_hash TEXT NOT NULL, payload_json TEXT NOT NULL, revision TEXT NOT NULL)')
            for id_, before, after, payload in changes:
                db.execute('INSERT OR REPLACE INTO library_content_repairs VALUES (?,?,?,?,?)', (id_, before, after, payload, report['revision']))
                db.execute('UPDATE library_entries SET payload_json=? WHERE id=?', (payload, id_))
    report['count'] = len(changes)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    db.close()
    print(json.dumps({k:v for k,v in report.items() if k not in ('recovered',)}, ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('database', type=Path)
    parser.add_argument('--report', required=True)
    parser.add_argument('--apply', action='store_true')
    args=parser.parse_args()
    repair(args.root, args.database, args.report, args.apply)
