import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKC').replace(/[\s|｜·'’‘\-]/g,'').toLowerCase();
const jsonLines = file => fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(JSON.parse);
const safePath = (root, relative) => {
  const target=path.resolve(root,relative);
  if(!target.startsWith(path.resolve(root)+path.sep)) throw new Error('资料路径越界');
  return target;
};
const bodyOf = markdown => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const flexibleName = value => [...String(value).replace(/\s/g,'')].map(escapeRegex).join('\\s*');
const classNames=['吟游诗人','牧师','德鲁伊','德鲁依','圣武士','游侠','术士','邪术师','法师','奇械师'];
const schoolPattern='防护|咒法|预言|惑控|塑能|幻术|死灵|变化';

export function spellSections(markdown) {
  const headings=[...markdown.matchAll(/^#{2,6}\s+(.+)$/gm)];
  const result=[];
  for(let i=0;i<headings.length;i++) {
    const title=headings[i][1].trim();
    const text=markdown.slice(headings[i].index+headings[i][0].length,headings[i+1]?.index??markdown.length).trim();
    const meta=text.match(new RegExp(`^(?:([一二三四五六七八九1-9])\\s*环\\s*(${schoolPattern})|(?:(${schoolPattern})\\s*)?戏法(?:\\s*(${schoolPattern}))?)([\\s\\S]*?)施法时间[：:]\\s*([\\s\\S]*?)施法距离[：:]\\s*([\\s\\S]*?)法术成分[：:]\\s*([\\s\\S]*?)持续时间[：:]\\s*([\\s\\S]+)$`));
    if(!meta) continue;
    const rank=meta[1]?(/\d/.test(meta[1])?Number(meta[1]):'一二三四五六七八九'.indexOf(meta[1])+1):0;
    const school=meta[2]||meta[3]||meta[4];
    if(!school) continue;
    const bilingual=title.includes('｜')||title.includes('|')?title.split(/[｜|]/):(title.match(/^(.+?)\s+([A-Za-z].*)$/)?.slice(1)||[title]);
    const name=bilingual[0].replace(/^\*+|\*+$/g,'').trim();
    if(!name||name.length>40||!/[\u3400-\u9fff]/.test(name)) continue;
    const duration=meta[9].match(/^(?:(?:专注|集中)[，,]?\s*)?(?:至多\s*)?(?:立即|瞬间|特殊|直到被解除|直至被解除|永久|[\d一二三四五六七八九十百]+\s*(?:分钟|小时|轮|回合|日|天))(?:[（(][^）)]*[）)])?/);
    if(!duration) continue;
    const classes=classNames.filter(n=>meta[5].includes(n)).map(n=>n==='德鲁依'?'德鲁伊':n);
    const components=meta[8].trim();
    result.push({name,englishName:bilingual[1]?.trim()||'',rank,payload:{
      学派:school,职业列表:[...new Set(classes)],职业适用原文:meta[5].trim(),
      仪式:meta[5].includes('仪式')?'是':'',专注:duration[0].includes('专注')?'是':'',
      施法时间:meta[6].trim(),施法距离:meta[7].trim(),持续时间:duration[0].trim(),
      'V 言语':/\bV\b/.test(components)?'是':'','S 姿势':/\bS\b/.test(components)?'是':'','M 材料':/\bM\b/.test(components)?'是':'',
      材料内容:components.match(/M\s*[（(]([\s\S]*)[）)]/)?.[1]||'',
      法术详述:meta[9].slice(duration[0].length).trim(),原始条目:`${title}\n${text}`,
    }});
  }
  return result;
}

export function importCompendium({packageRoot,itemIndex,database,dryRun=false,refresh=false}) {
  const documentFile=path.join(packageRoot,'03_知识库/文档.jsonl');
  const docs=jsonLines(documentFile),items=jsonLines(itemIndex);
  const sourceHash=hash(Buffer.concat([fs.readFileSync(documentFile),fs.readFileSync(itemIndex)]));
  const sourceId='compendium-5e-'+sourceHash.slice(0,16);
  const db=new DatabaseSync(database,{readOnly:dryRun});
  const report={sourceId,sourceHash,documents:docs.length,added:{},structured:[],duplicates:[],unparsedItems:[],spellCandidates:0,scope:'dnd5e-2014',dryRun};
  const known=new Map();
  for(const e of db.prepare("SELECT id,kind,name,english_name FROM library_entries WHERE ruleset='dnd5e-2014' AND source_id!=?").all(sourceId)) {
    for(const value of [e.name,e.english_name]) if(value) known.set(`${e.kind}:${norm(value)}`,e.id);
  }
  const rows=[];
  const category=new Map();
  const add=(doc,kind,name,englishName,rank,payload,subcat='',dedupe=true)=>{
    const keys=[name,englishName].filter(Boolean).map(value=>`${kind}:${norm(value)}`);
    const existing=dedupe?keys.map(key=>known.get(key)).find(Boolean):null;
    if(existing){report.duplicates.push({kind,name,source:doc.原始页面,existing});return;}
    const id=`${sourceId}:${hash(kind+'|'+doc.document_id+'|'+name).slice(0,24)}`;
    if(rows.some(row=>row[0]===id)) return;
    const label=/第三方/.test(doc.规则世代)?'第三方':/测试/.test(doc.规则世代)?'测试材料':doc.规则世代==='待核'?'规则待核':'';
    rows.push([id,sourceId,'dnd5e-2014',kind,name,englishName||null,rank,
      doc.来源卷册+(label?` · ${label}`:''),doc.原始页面,name,'imported_unverified',JSON.stringify({
        ...payload,来源资料包:'5E 不全书 v2024.4.9',来源卷册:doc.来源卷册,来源文件:doc.原始页面,
        规则世代:doc.规则世代,来源性质:doc.来源性质,内容标记:label||'2014体系资料，未经逐条复核',
      })]);
    category.set(id,subcat);report.added[kind]=(report.added[kind]||0)+1;
    if(kind!=='reference')report.structured.push({id,kind,name,rank,source:doc.原始页面});
    for(const key of keys) known.set(key,id);
  };
  const byPath=new Map(docs.map(doc=>[doc.原始页面,doc]));
  const markdowns=new Map();
  for(const doc of docs) {
    const body=bodyOf(fs.readFileSync(safePath(packageRoot,doc.规范化Markdown),'utf8'));
    markdowns.set(doc.原始页面,body);
    add(doc,'reference',doc.页面标题,doc.原始页面,null,{分类:doc.一级分类,正文:body,自动填充边界:'完整参考正文，不自动授予职业能力或数值；图片未嵌入'},doc.一级分类,false);
  }
  // Existing workbook records win. Alternate source text remains available in reference pages.
  const ordered=[...docs].sort((a,b)=>Number(b.规则世代==='2014规则体系')-Number(a.规则世代==='2014规则体系'));
  for(const doc of ordered) {
    if(doc.一级分类!=='法术'||!doc.规则世代.startsWith('2014')||/速查|法术列表/.test(doc.原始页面)) continue;
    for(const spell of spellSections(markdowns.get(doc.原始页面))) {
      report.spellCandidates++;
      add(doc,'spell',spell.name,spell.englishName,spell.rank,spell.payload,spell.payload.学派);
    }
  }
  // Use the earlier item index only for identity; recover complete text from page boundaries, never its short summary.
  const magicItems=items.filter(item=>['魔法物品','神器','药水/卷轴/消耗品'].includes(item.类别));
  for(const [source,pageItems] of Object.entries(Object.groupBy(magicItems,item=>item.来源页面或文件))) {
    const doc=byPath.get(source),body=markdowns.get(source);
    if(!doc||!body||!doc.规则世代.startsWith('2014')) continue;
    const located=[];
    for(const item of pageItems) {
      const pattern=new RegExp(flexibleName(item.中文名)+'[\\s|｜]*'+flexibleName(item.英文名)+'\\s*'+flexibleName(item.子类别)+'\\s*[，,]\\s*'+flexibleName(item.稀有度),'i');
      const match=pattern.exec(body);
      if(!match) {report.unparsedItems.push({name:item.中文名,source});continue;}
      located.push({item,index:match.index,header:match[0]});
    }
    located.sort((a,b)=>a.index-b.index);
    for(let i=0;i<located.length;i++) {
      const {item,index,header}=located[i];
      const description=body.slice(index,located[i+1]?.index??body.length).trim();
      const kind=item.子类别==='奇物'?'curio':'magic_item';
      const condition=description.slice(0,header.length+100).match(/[（(]([^）)]*同调[^）)]*)[）)]/)?.[1]||'';
      add(doc,kind,item.中文名,item.英文名,null,{
        类型:item.子类别,稀有度:item.稀有度,需要同调:condition?'是':item.是否同调,同调条件:condition,
        描述:description,自动填充边界:'仅带入文本与稀有度；实际同调由玩家选择，效果不自动执行',
      },item.子类别);
    }
  }
  try {
    if(!dryRun) {
      db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
      const already=db.prepare('SELECT id FROM library_sources WHERE id=?').get(sourceId);
      if(already&&!refresh){db.exec('ROLLBACK');return {...report,status:'already_imported'};}
      if(already) {
        db.prepare('DELETE FROM library_entry_classifications WHERE entry_id IN (SELECT id FROM library_entries WHERE source_id=?)').run(sourceId);
        db.prepare('DELETE FROM library_entries WHERE source_id=?').run(sourceId);
        db.prepare('DELETE FROM library_sources WHERE id=?').run(sourceId);
      }
      db.prepare('INSERT INTO library_sources VALUES (?,?,?,?,?,?,?)').run(sourceId,'5E 不全书 v2024.4.9（完整正文与补充条目）',sourceHash,'dnd5e-2014',new Date().toISOString(),'user_provided','本地资料包，非 2024 核心规则；第三方和测试材料保留标记，不等于全部官方或已授权公开分发');
      const tax=db.prepare('INSERT INTO library_taxonomy VALUES (?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET domain=excluded.domain,label=excluded.label,capability=excluded.capability,warning=excluded.warning');
      tax.run('reference','参考文献','规则与资料正文','text_only','整页参考资料；第三方、测试材料和模组内容请核对来源，不自动赋予人物能力');
      tax.run('magic_item','装备','其他魔法物品/神器','text_only','与普通物品、奇物分别分类；仅提供完整资料，不自动修改攻击或 AC');
      tax.run('curio','装备','奇物','selection','名称、稀有度与文字可带入；需要同调不等于已同调，不自动执行物品效果');
      const insert=db.prepare('INSERT INTO library_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      const classify=db.prepare('INSERT INTO library_entry_classifications VALUES (?,?,?,?)');
      for(const row of rows){insert.run(...row);classify.run(row[0],category.get(row[0]),'compendium_document_or_bounded_section',row[3]==='reference'||row[3]==='magic_item'?'text_only':'selection');}
      db.exec('COMMIT');
    }
    return {...report,status:dryRun?'preview':'imported'};
  } catch(error){if(!dryRun)db.exec('ROLLBACK');throw error;} finally{db.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [packageRoot,itemIndex,database,...flags]=process.argv.slice(2);
  if(!packageRoot||!itemIndex||!database) throw new Error('用法：node tools/import-5e-compendium.mjs <知识库目录> <条目索引.jsonl> <数据库> [--dry-run]');
  const result=importCompendium({packageRoot,itemIndex,database,dryRun:flags.includes('--dry-run'),refresh:flags.includes('--refresh')});
  const reportPath=flags.find(arg=>arg.startsWith('--report='))?.slice(9);
  if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,structured:result.structured.length,duplicates:result.duplicates.length,unparsedItems:result.unparsedItems.length},null,2));
}
