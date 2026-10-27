import { createHash } from 'node:crypto';
import { characterClasses, classIdForName } from '../prototype/character-rules.mjs';
import { mappedSpecies, speciesText } from './species-mapping.mjs';

// Resolve only archived sources from the requested edition. Never borrow another
// edition's traits or infer an unlabelled acquisition level from character level.
const key = text => String(text || '').replace(/\u200b/g, '').trim().split(/[A-Za-z]/)[0].replace(/\s/g, '');
function joinedHeadings(body) {
  body=body.replace(/\r/g,'');
  let prior;
  do {
    prior=body;
    body=body.replace(/^(#{3,6}\s+[\p{Script=Han}]+)\n\s*#{3,6}\s+([\p{Script=Han}][^\n]*)/gmu,'$1$2')
      .replace(/^(#{3,6}[^\n]+)\n\s*#{3,6}\s+([A-Za-z][^\n]*)/gm,'$1 $2');
  } while(body!==prior);
  return body;
}
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unpack = row => row && ({ ...row, payload: JSON.parse(row.payload_json) });
const caches=new WeakMap();
function entries(db, ruleset, kind) {
  let cache=caches.get(db); if(!cache) caches.set(db,cache=new Map());
  const id=ruleset+':'+kind;
  if(!cache.has(id)) cache.set(id,db.prepare('SELECT * FROM library_entries WHERE ruleset=? AND kind=?').all(ruleset, kind).map(unpack));
  return cache.get(id);
}
function reference(refs, name, preferredId, core=false) {
  if (preferredId) return refs.find(r => r.id === preferredId);
  let found = refs.filter(r => key(r.name) === key(name));
  const english=String(name).match(/\s+([A-Za-z][A-Za-z '\-]+)(?:\s*\(|$)/)?.[1]?.trim();
  if(!found.length && english) {
    const title=new RegExp('^(?:#{1,6}\\s*)?[^\\n。]{0,60}'+escape(english)+'\\s*$','im');
    found=refs.filter(r=>title.test((r.payload.正文||'').slice(0,500).replace(/\r/g,'')));
  }
  if(core) {const phb=found.filter(r=>r.source_sheet.startsWith('玩家手册/'));if(phb.length===1)return phb[0];}
  if (found.length === 1) return found[0];
  return null; // Same-name variants require a real source choice, not first-match.
}
function subclassReference(refs,name) {
  // The source archive uses several older Chinese translations. Match verified
  // titles, not arbitrary occurrences in prose, and never substitute a UA draft.
  refs=refs.filter(r=>!/(?:第三方|\/UA\/|过时|补充)/.test(r.source_sheet+' '+r.name));
  const titleKey=n=>key(n.replace(/\.html?$/,'').replace(/^(?:吟游诗人|圣武士|邪术师|野蛮人|奇械师|德鲁伊|游荡者|战士|术士|武僧|法师|游侠|牧师)[-：:]/,'')).replace(/[（(].*$/,'');
  const aliases={'暴风术法':'风暴术法','剑咏传承':'剑咏','邪魔宗主':'邪魔','巨灵宗主':'巨灵','图腾勇士道途':'图腾武者道途'};
  const target=aliases[titleKey(name)]||titleKey(name);
  const found=refs.filter(r=>titleKey(r.name)===target);
  if(found.length===1) return found[0];
  const english=String(name).match(/\s+([A-Za-z][A-Za-z '\-]+)(?:\s*\(|$)/)?.[1]?.trim();
  if(english) {
    const title=new RegExp('^(?:#{1,6}\\s*)?[^\\n。]{0,70}'+escape(english)+'\\s*$','im');
    const exact=(found.length?found:refs).filter(r=>title.test(joinedHeadings(r.payload.正文||'').slice(0,1500)));
    if(exact.length===1) return exact[0];
  }
  return reference(refs,name);
}
function makeEntries(source, kind, parts, link) {
  return parts.flatMap(part => {
    // Persisted descriptions are capped at 3000. Split instead of silently losing text.
    const chunks = String(part.description).match(/[\s\S]{1,2800}/g) || [];
    return chunks.map((description, i) => {
      const name = part.name + (i ? `（续 ${i + 1}）` : '');
      const hash = createHash('sha256').update(`${kind}:${link.speciesOption || ''}:${part.name}:${part.level || 0}:${i}`).digest('hex').slice(0,16);
      return { id: `${source.id}:feature:${hash}`, kind, name, ruleset: source.ruleset,
        sourceBook: source.source_book, sourceSheet: source.source_sheet, sourceRange: part.range || source.source_range,
        payload: { 描述: description, 来源卷册: source.payload.来源卷册 || source.source_book,
          来源文件: source.source_sheet, 来源参考条目: source.id,
          规则关联: { ...link, minLevel: part.level || 1, source: part.range || source.source_sheet } } };
    });
  });
}

export function parseSubclassFeatures(body, {minLevel=0}={}) {
  body=joinedHeadings(body);
  // PHB uses Markdown headings; expansion pages often flattened bilingual titles.
  const markers = [...body.matchAll(/^#{3,6}\s+([^\n]+)\n/gm)].map(m => ({ index:m.index, end:m.index+m[0].length, name:key(m[1]) }));
  for (const m of body.matchAll(/(?:^|[\n。！？） ])([\p{Script=Han}：·]{2,22})\s+[A-Za-z][A-Za-z '\-:’]+?\s+(?=(?:(?:当你|你在|从|自|在|第)[^。\n]{0,35}?)?\d{1,2}\s*级)/gu)) {
    if (!markers.some(h => m.index >= h.index && m.index < h.end)) markers.push({index:m.index,end:m.index+m[0].length,name:key(m[1])});
  }
  const expected=[];
  const table=body.match(/\|[^\n|]*等级\s*\|\s*特性\s*\|\n(?:\|[^\n]*\n)+/);
  if(table) for(const row of table[0].matchAll(/^\|\s*(\d{1,2})(?:st|nd|rd|th|级)?\s*\|\s*([^|]+)\|/gm)) {
    for(const name of row[2].replace(/[（(][^）)]*[）)]/g,'').split(/[，、,]/).map(s=>s.trim()).filter(Boolean)) {
      if(!expected.includes(name)) expected.push(name);
      const title=new RegExp(escape(name)+'\\s+[A-Za-z][A-Za-z \'’:\\-]+?(?=\\s*(?:[。:：]|[\\p{Script=Han}\\d]))','u');
      const match=title.exec(body.slice(table.index+table[0].length));
      if(match) {
        const index=table.index+table[0].length+match.index;
        const existing=markers.find(m=>index>=m.index && index<m.end);
        if(existing) {existing.name=name;existing.level=Math.min(existing.level||20,Number(row[1]));}
        else markers.push({index,end:index+match[0].length,name,level:Number(row[1])});
      }
    }
  }
  markers.sort((a,b)=>a.index-b.index);
  const abilities = [];
  for (let i=0;i<markers.length;i++) {
    const marker=markers[i], description=body.slice(marker.end,markers[i+1]?.index ?? body.length).trim();
    const intro=description.slice(0,140);
    const spellList=/^(?:.*圣誓法术|破誓者法术|.*领域法术|扩展法术列表|扩展法术)$/.test(marker.name);
    const nestedList=spellList && abilities.some(m=>/^(?:圣誓法术|领域法术|扩展法术列表)$/.test(m.name));
    const arrowOptions=markers.find(m=>m.name==='奥术射击选项')?.index ?? Infinity;
    const choice=/^(?:[（(]第\d+级或更高|[。．]|先决|前提)/.test(description) || /符文$/.test(marker.name) || marker.index>arrowOptions;
    const overview=/^(?:神圣誓言|修行宗派|圣武士：破誓者)$/.test(marker.name);
    const stated=Number(intro.match(/(?:^|。)\s*(?:(?:当你|在你|你在|从|自|在|当)[^。\n\d]{0,30})?(?:第\s*)?(\d{1,2})(?:(?:\s*级)?\s*[、，,和及]\s*第?\s*\d{1,2})*\s*级/)?.[1]);
    const level=choice||overview||nestedList ? 0 : stated || marker.level || (spellList ? minLevel : 0);
    if(level>=1 && level<=20) abilities.push({...marker,level});
  }
  // Non-ability subheadings (choices, spell tables, etc.) belong to their parent.
  const parts=abilities.map((m,i)=>({name:m.name,level:m.level,description:body.slice(m.end,abilities[i+1]?.index??body.length).trim()}));
  parts.unresolved=expected.filter(name=>!parts.some(p=>p.name===name));
  return parts;
}

function column(index) { let out=''; for(;index;index=Math.floor((index-1)/26)) out=String.fromCharCode(65+(index-1)%26)+out; return out; }
function workbookSpecies(db, row) {
  const index=row.payload.特性索引;
  if(!index || !Number.isInteger(index.行) || !Number.isInteger(index.起列) || !Number.isInteger(index.止列)) return [];
  const get=db.prepare('SELECT value_json FROM library_cells WHERE source_id=? AND sheet_name=? AND address=?');
  const cell=address=>JSON.parse(get.get(row.source_id,'种族',address)?.value_json || 'null');
  const parts=[];
  for(let n=index.起列;n<=Math.min(index.止列,83);n++) {
    const address=column(11+n)+(index.行*2), name=cell(address), description=cell(column(11+n)+(index.行*2+1));
    if(typeof name==='string' && name.trim() && typeof description==='string' && description.trim()) parts.push({name,description,range:`种族!${address}`});
  }
  return parts;
}

export function parseSpeciesTraits(body, name, {base=false,boundaries=[]}={}) {
  const structured=speciesText(body);
  const headings=[...structured.matchAll(/^#{3,6}\s+([^\n]+)\n/gm)].map(m=>({name:key(m[1]),index:m.index,end:m.index+m[0].length}));
  const aliases=/^(卓尔|卓尔精灵)$/.test(name)?['黑暗精灵','卓尔']: [key(name)];
  const start=headings.findIndex(h=>aliases.some(a=>base ? h.name===a+'特质'||h.name===a+'特性' : h.name===a || h.name===a+'特质'));
  if(start>=0) {
    const parts=[];
    for(let i=start+1;i<headings.length;i++) {
      const h=headings[i];
      if(h.name==='亚种' || /特质$/.test(h.name) || boundaries.some(n=>key(n)===h.name) || ['卓尔之暗','罕见种族','地底侏儒','灰矮人'].includes(h.name)) break;
      const description=structured.slice(h.end,headings[i+1]?.index??structured.length).trim().replace(/^[。．:：]\s*/,'');
      if(description && h.name && !['年龄','阵营'].includes(h.name)) parts.push({name:h.name,description});
    }
    if(parts.length) return parts;
  }
  return parseFlatSpeciesTraits(body,name,{base});
}

function parseFlatSpeciesTraits(body, name, {base=false}={}) {
  // A bounded section keeps sibling subraces/optional variants out of the grant.
  const clean=body.replace(/\r/g,'');
  const aliases=/^(卓尔|卓尔精灵)$/.test(name) ? '(?:黑暗精灵|卓尔)' : escape(key(name));
  const pattern=name==='变体人类' ? /(?:^|\n)>\s*变体人类特质\s+Variant Human Traits/
    : base ? new RegExp(`(?:^|\\s)(?:#{1,6}\\s*)?${aliases}(?:特质|特性)\\s*(?:[A-Za-z][A-Za-z ]*?Traits)?`, 'm')
    : new RegExp(`^(?:#{1,6}\\s*)?${aliases}\\s+[A-Za-z][^\\n]*`, 'm');
  const start=pattern.exec(clean);
  if(!start) return [];
  let section=clean.slice(start.index+start[0].length);
  if(base && section.includes('\n>')) section=section.slice(0,section.indexOf('\n>'));
  const next=section.search(/\n(?:#{1,6}\s*|>\s*)?[\p{Script=Han}]{2,20}\s+[A-Z][A-Za-z '\-’]+(?:[^。\n]*)\n/u);
  if(next>=0) section=section.slice(0,next);
  const traitsStart=section.search(/属性值加成\s+Ability Score Increase/);
  if(traitsStart>=0) section=section.slice(traitsStart);
  const subraceStart=section.search(/亚种\s+Subrace/);
  if(subraceStart>=0) section=section.slice(0,subraceStart);
  const markers=[...section.matchAll(/(?:^|[。！？：:\n]\s*)([\p{Script=Han}]{1,16}(?:[ \t]+[\p{Script=Han}]{1,8})*)[ \t]+(?:[A-Z][A-Za-z '\-’]*?|language)\s*[。．:：]/gu)]
    .map(m=>({index:m.index+m[0].indexOf(m[1]),end:m.index+m[0].length,name:m[1].replace(/\s/g,'')}));
  for(const m of section.matchAll(/(?:^|[。\n ])(语言)\s*。/g)) markers.push({index:m.index,end:m.index+m[0].length,name:m[1]});
  markers.sort((a,b)=>a.index-b.index);
  return markers.map((m,i)=>({name:m.name,description:section.slice(m.end,markers[i+1]?.index??section.length).trim()}))
    .filter(p=>p.description && !['亚种','年龄','阵营'].includes(p.name));
}

export function resolveAdditionalFeatures(db, context, kind) {
  const {ruleset}=context, warnings=[], result=[], sourceChoices=[];
  if(kind==='class' && ruleset==='dnd5e-2014') {
    const classes=entries(db,ruleset,'class'), refs=entries(db,ruleset,'reference').filter(r=>/职业|角色选项|玩家选项|角色创建|冒险之主|子职|术士-/.test(r.source_sheet));
    for(const owned of characterClasses(context).filter(c=>c.subclass)) {
      const owner=classes.find(c=>classIdForName(c.name)===owned.classId);
      const option=owner?.payload.规则关联?.subclasses?.find(s=>key(s.name)===key(owned.subclass));
      if(!option) {warnings.push(`${owned.subclass}：未找到对应职业的子职目录，未自动补入。`);continue;}
      if(owned.level<option.minLevel) continue;
      const source=subclassReference(refs,option.name);
      if(!source) {warnings.push(`${owned.subclass}：完整说明缺失或存在同名版本，请从资料库核对。`);continue;}
      const parts=parseSubclassFeatures(source.payload.正文||'',{minLevel:option.minLevel});
      if(!parts.length) {warnings.push(`${owned.subclass}：正文未能可靠识别能力等级，请手动核对。`);continue;}
      if(parts.unresolved.length) warnings.push(`${owned.subclass}：来源表格中的 ${parts.unresolved.join('、')} 与正文标题未能完全对应，请核对原文；未凭目录虚构能力。`);
      result.push(...makeEntries(source,'class_feature',parts.filter(p=>p.level<=owned.level),{className:owner.name,subclass:owned.subclass}));
    }
  }
  if(kind==='species') {
    const species=entries(db,ruleset,'species');
    const selected=species.find(s=>s.id===context.speciesEntryId && key(s.name)===key(context.species)) || species.find(s=>key(s.name)===key(context.species));
    const sub=context.subrace?.trim() ? species.find(s=>key(s.name)===key(context.subrace) && s.payload.族系===selected?.payload.族系) : null;
    if(!selected) return {entries:[],warnings:['请先选择资料库中的种族；自定义种族请手动添加特性。']};
    if(context.subrace?.trim() && (!sub || sub.payload.族系!==selected.payload.族系)) warnings.push('亚种不属于当前族系或未找到对应资料，本次只补入已确认的种族特性。');
    if(ruleset==='dnd5e-2014') {
      const resolved=mappedSpecies(context,selected,sub,species,entries(db,ruleset,'reference'),parseSpeciesTraits,makeEntries);
      resolved.warnings.unshift(...warnings);return resolved;
    }
    const family=species.find(s=>s.name===selected.payload.族系);
    const rows=[family,selected,sub?.payload.族系===selected.payload.族系?sub:null].filter((s,i,a)=>s&&a.findIndex(t=>t?.id===s.id)===i);
    for(const row of rows) {
      const source=row, parts=workbookSpecies(db,row);
      if(!parts.length) {warnings.push(`${row.name}：现有来源未能可靠提取特性，请从资料库核对。`);continue;}
      const link={species:context.species,subrace:row===sub?context.subrace:'',speciesOption:row.name};
      // Stable IDs distinguish base and subrace ASIs sharing the same reference page.
      result.push(...makeEntries(source,'species_feature',parts,link));
    }
  }
  return {entries:result,warnings,sourceChoices};
}
