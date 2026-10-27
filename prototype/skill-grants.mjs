import { CLASSES,SKILLS } from './content.mjs';
import { characterClasses } from './character-rules.mjs';
import { TOOL_OPTIONS } from './proficiency-grants.mjs';
import { featChoiceKey } from './advancement.mjs';

const all=Object.keys(SKILLS), list=s=>s.split(' ');
const classOptions={
  artificer:list('arcana history investigation medicine nature perception sleightOfHand'),
  barbarian:list('animalHandling athletics intimidation nature perception survival'),
  bard:all,
  cleric:list('history insight medicine persuasion religion'),
  druid:list('arcana animalHandling insight medicine nature perception religion survival'),
  fighter:list('acrobatics animalHandling athletics history insight intimidation perception survival'),
  monk:list('acrobatics athletics history insight religion stealth'),
  paladin:list('athletics insight intimidation medicine persuasion religion'),
  ranger:list('animalHandling athletics insight investigation nature perception stealth survival'),
  rogue:list('acrobatics athletics deception insight intimidation investigation perception performance persuasion sleightOfHand stealth'),
  sorcerer:list('arcana deception insight intimidation persuasion religion'),
  warlock:list('arcana deception history intimidation investigation nature religion'),
  wizard:list('arcana history insight investigation medicine religion'),
};
const aliases={intimidation:['威胁'],medicine:['医疗'],persuasion:['说服'],deception:['欺骗'],stealth:['隐蔽'],survival:['生存'],animalHandling:['驯养']};
const namedSkills=text=>all.filter(id=>[SKILLS[id].name,...(aliases[id]||[])].some(n=>text.includes(n)));
export function parseBackgroundSkills(text='') {
  text=String(text);
  if(!/选择|任选|任意/.test(text)) return {fixed:namedSkills(text),choice:null};
  const from=text.indexOf('从'),prefix=from>=0?text.slice(0,from):'';
  const fixed=prefix&&!/选择|任选|任意|或|不能|除外/.test(prefix)?namedSkills(prefix):[];
  const selection=from>=0?text.slice(from):text;
  const match=selection.match(/(?:选择(?:的)?|任选|任意)\s*([一二三两123])\s*(?:种|项|个)?/);
  const count=match?({'一':1,'二':2,'两':2,'三':3})[match[1]]||Number(match[1]):null;
  const options=namedSkills(selection);
  const simple=count&&(from>=0||!options.length)&&!/(?:此外|额外|以及|不能|除外|适合|工具|语言)/.test(selection)&&((selection.match(/选择|任选|任意/g)||[]).length===1);
  return {fixed,choice:{count:simple?count:0,options:options.length?options:all,review:simple?'':'此背景技能包含未识别的选择条件，请保留原文并手动核对。'}};
}
const sourceHash=text=>{let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(16);};
export const skillChoiceLabel=id=>id==='tool:thieves'?'盗贼工具（专精）':id.startsWith('tool:')?`${id.slice(5)}（工具）`:SKILLS[id]?.name||id;
export function normalizeSkillChoices(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0,100).filter(([key])=>/^dnd5[er]-\d{4}:/.test(key)&&key.length<180).map(([key,values])=>[key,Array.isArray(values)?values.slice(0,6).map(v=>all.includes(v)||v==='tool:thieves'||(typeof v==='string'&&v.startsWith('tool:')&&TOOL_OPTIONS.includes(v.slice(5)))?v:''):[]]));
}
function backgroundChoice(c) {
  if(c.backgroundSource&&(c.backgroundSource.ruleset!==c.ruleset||c.backgroundSource.name!==c.background)) return null;
  const text=String(c.backgroundSkillProficiencies||c.backgroundSource?.payload?.技能熟练||'');
  const {fixed,choice}=parseBackgroundSkills(text);if(!choice) return null;
  return {id:`${c.ruleset}:background:${sourceHash(c.background+'|'+text)}`,name:`背景「${c.background||'自定义'}」技能`,kind:'skill',fixed,...choice};
}

export function skillGrantState(c,backgroundSkills=[],features=[],knownTools=[]) {
  const groups=[],classes=characterClasses(c),r=c.ruleset==='dnd5r-2024';
  const bg=backgroundChoice(c);if(bg) groups.push(bg);
  for(const [index,item] of classes.entries()) {
    const count=index===0?(item.classId==='rogue'?4:['bard','ranger'].includes(item.classId)?3:2):['bard','ranger','rogue'].includes(item.classId)?1:0;
    if(count&&classOptions[item.classId]) groups.push({id:`${c.ruleset}:class:${item.classId}:${index===0?'initial':'multiclass'}`,name:`${CLASSES[item.classId].name}${index===0?'初始':'兼职'}技能`,kind:'skill',count,options:r&&item.classId==='rogue'?classOptions.rogue.filter(id=>id!=='performance'):classOptions[item.classId]});
  }
  const expertise=[];
  for(const item of classes) {
    const levels=item.classId==='rogue'?[[1,2],[6,2]]:item.classId==='bard'?[[r?2:3,2],[r?9:10,2]]:r&&item.classId==='ranger'?[[2,1],[9,2]]:[];
    for(const [level,count] of levels) if(item.level>=level) expertise.push({id:`${c.ruleset}:expertise:${item.classId}:${level}`,name:`${CLASSES[item.classId].name}${level}级专精`,kind:'expertise',count,allowTools:!r&&item.classId==='rogue'});
  }
  const featExpertise=[];
  for(const feature of features.filter(f=>f.kind==='feat')) {
    const text=String(feature.catalogEntry?.payload?.描述??feature.description??''),key=featChoiceKey(feature,c);
    if(feature.name==='熟习'&&/三项.*技能[和或]工具/.test(text)) groups.push({id:`${key}:proficiencies`,name:'熟习：技能 / 工具',kind:'mixed',count:3,options:[...all,...TOOL_OPTIONS.filter(t=>!r||!t.startsWith('载具')).map(t=>'tool:'+t)]});
    if(feature.name==='技艺专家'&&/技能.*熟练/.test(text)&&/专精/.test(text)) {
      groups.push({id:`${key}:skill`,name:'技艺专家：技能熟练',kind:'skill',count:1,options:all});
      featExpertise.push({id:`${key}:expertise`,name:'技艺专家：技能专精',kind:'expertise',count:1});
    }
  }
  const ranks=Object.fromEntries(all.map(id=>[id,Math.max(0,Math.min(2,Number(c.skills?.[id])||0))]));
  const sources=Object.fromEntries(all.map(id=>[id,[]]));
  for(const id of backgroundSkills) {ranks[id]=Math.max(1,ranks[id]);sources[id].push('背景固定熟练');}
  const choices=normalizeSkillChoices(c.skillChoices), proficiencyUsed=new Set([...backgroundSkills,...all.filter(id=>ranks[id]>=1),...knownTools.map(t=>'tool:'+t)]), expertiseUsed=new Set(all.filter(id=>ranks[id]===2)), issues=[],tools=[];
  const apply=group=>{
    const selected=choices[group.id]||[],seen=new Set();group.selected=selected;group.valid=[];group.errors=[];
    if(group.review) {group.errors.push(group.review);issues.push(group.review);return;}
    selected.forEach((id,index)=>{
      if(!id) return;
      let error='';
      if(index>=group.count) error='超过可选数量';
      else if(!group.options.includes(id)) error=group.kind==='expertise'?'需要先获得该项熟练':'不在此来源的可选范围';
      else if(seen.has(id)) error='不能重复选择';
      else if((group.kind==='expertise'?expertiseUsed:proficiencyUsed).has(id)) error='已由其他来源授予，请改选';
      seen.add(id);
      if(error){group.errors.push(`${skillChoiceLabel(id)}：${error}`);return;}
      group.valid.push(id);
      if(group.kind==='expertise') expertiseUsed.add(id);else proficiencyUsed.add(id);
      if(id.startsWith('tool:')) {if(id!=='tool:thieves') tools.push(id.slice(5));}
      else {ranks[id]=Math.max(ranks[id],group.kind==='expertise'?2:1);sources[id].push(group.name);}
    });
    if(group.valid.length<group.count) group.errors.push(`已选 ${group.valid.length} / ${group.count}`);
    issues.push(...group.errors.map(s=>`${group.name}：${s}`));
  };
  groups.forEach(apply);
  for(const group of [...expertise,...featExpertise]) {
    group.options=all.filter(id=>ranks[id]===1);
    // The 2014 Rogue grants thieves' tools on entry, including multiclass entry.
    if(group.allowTools) group.options.push('tool:thieves');
    groups.push(group);apply(group);
  }
  const active=new Set(groups.map(g=>g.id));
  const inactive=Object.entries(choices).filter(([id,values])=>!active.has(id)&&values.some(Boolean)).length;
  if(inactive) issues.push(`${inactive} 组旧来源选择已停用并保留，未写入手动技能。`);
  return {groups,ranks,sources,issues,inactive,tools,toolExpertise:expertiseUsed.has('tool:thieves'),pending:groups.filter(g=>g.errors.length).length};
}
