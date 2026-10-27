import { ABILITIES, CLASSES } from './content.mjs';
import { characterClasses, totalLevel } from './character-rules.mjs';
import { classSavingThrows } from './saving-grants.mjs';

const abilityIds=Object.keys(ABILITIES);
export function advancementSlots(c) {
  const classes=characterClasses(c);
  if(!['dnd5e-2014','dnd5r-2024'].includes(c.ruleset)||totalLevel(c)>20||new Set(classes.map(x=>x.classId)).size!==classes.length) return [];
  return classes.flatMap(item=>{
    if(!CLASSES[item.classId]) return [];
    const levels=item.classId==='fighter'?[4,6,8,12,14,16,19]:item.classId==='rogue'?[4,8,10,12,16,19]:[4,8,12,16,19];
    return levels.filter(level=>level<=item.level).map(level=>({id:`${c.ruleset}:${item.classId}:${level}`,classId:item.classId,level,
      name:`${CLASSES[item.classId].name} ${level}级${c.ruleset==='dnd5r-2024'&&level===19&&item.classId!=='artificer'?'传奇恩惠 / 专长':'属性提升 / 专长'}`}));
  });
}
export function advancementSourceStatus(feature,c) {
  if(feature.kind!=='feat') return '';
  if(feature.sourceRuleset&&feature.sourceRuleset!==c.ruleset) return '取得此专长时的规则版本不同';
  if(feature.advancementSource) {
    if(!advancementSlots(c).some(s=>s.id===feature.advancementSource)) return '职业奖励来源未解锁或已不适用';
    if((c.featureEntries||[]).filter(f=>f.kind==='feat'&&f.advancementSource===feature.advancementSource&&f.effectMode!=='off').length>1) return '同一个职业奖励名额被重复占用，请移除或停用其中一项';
  } else if(Number(feature.level)>totalLevel(c)) return '尚未达到记录的获得等级';
  return '';
}

// Deliberately accepts only explicit, unconditional score-increase sentences.
// Other mechanics, prerequisites and conditional bonuses are not inferred from names.
export function featAbilitySpec(feature) {
  if(feature.kind!=='feat') return null;
  const description=String(feature.catalogEntry?.payload?.描述??feature.description??'');
  if(feature.name==='强健身心'&&/所选属性.*豁免|所选属性的豁免/.test(description)) {
    return {count:1,options:abilityIds,cap:20,repeatable:false,savingThrow:true,untrainedOnly:description.includes('不具有其豁免熟练')};
  }
  if(feature.name==='属性值提升'&&/一项属性(?:值)?提升2/.test(description)&&/两项属性各提升1/.test(description)&&/20/.test(description)) return {count:2,options:abilityIds,cap:20,repeatable:true};
  const matches=[];
  for(let line of description.split(/\n/)) {
    line=line.trim().replace(/^[•·\-]\s*/,'').replace(/^属性值提升(?:Ability Score Increase)?[。.:：]\s*/,'').replace(/加\s*1/,'提升1');
    const match=line.match(/^(?:你的?|你选择的?一项|选择一项)?((?:(?:力量|敏捷|体质|智力|感知|魅力)[、，,或和\s]*)+|属性)(?:属性)?(?:值)?(?:提升|增加|\+)1(?:点)?[，,]\s*(?:上限(?:为)?|至多提升至|最高不超过|最高)(20|30)[。.]?\s*$/);
    if(!match) continue;
    const options=match[1]==='属性'?abilityIds:abilityIds.filter(id=>match[1].includes(ABILITIES[id]));
    matches.push({count:1,options,cap:Number(match[2]),repeatable:/复选|Repeatable|多次选择|多次选取/.test(description)});
  }
  return matches.length===1?matches[0]:null;
}
export function featChoiceKey(feature,c) {
  let hash=2166136261;
  const text=[feature.name,feature.catalogEntry?.id||'',feature.catalogEntry?.payload?.描述??feature.description??''].join('|');
  for(const ch of text) hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  return `${c.ruleset}:${feature.id}:${(hash>>>0).toString(16)}`;
}
export function normalizeFeatChoices(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0,240).filter(([k])=>/^dnd5[er]-\d{4}:/.test(k)&&k.length<200).map(([k,v])=>[k,Array.isArray(v)?v.slice(0,2).map(id=>abilityIds.includes(id)?id:''):[]]));
}
export function advancementState(c,baseAbilities,activation) {
  const abilities={...baseAbilities},choices=normalizeFeatChoices(c.featAbilityChoices),rows=[],trace=[],issues=[],activations=[],seen=new Set();
  const slots=advancementSlots(c);
  const saving=classSavingThrows(c),savingThrows=new Set(saving.saves);
  const features=[...(c.featureEntries||[])];
  // Ordinary improvements precede cap-30 boons. No fabricated multiclass acquisition timeline.
  const order=f=>Number(f.level)||slots.find(s=>s.id===f.advancementSource)?.level||0;
  features.sort((a,b)=>(featAbilitySpec(a)?.cap||20)-(featAbilitySpec(b)?.cap||20)||order(a)-order(b)||Number(b.name==='属性值提升')-Number(a.name==='属性值提升'));
  for(const feature of features) {
    let spec=featAbilitySpec(feature);
    const key=featChoiceKey(feature,c),selected=choices[key]||[];
    if(spec?.untrainedOnly) {
      // A known single-class acquisition level keeps a later class save grant from
      // retroactively invalidating a legal earlier feat. Unknown timelines use current saves.
      const acquired=Number(feature.level)||slots.find(s=>s.id===feature.advancementSource)?.level;
      const prior=acquired&&characterClasses(c).length===1?classSavingThrows({...c,level:Math.min(c.level,acquired)}).saves:saving.saves;
      spec={...spec,options:spec.options.filter(id=>!prior.includes(id))};
    }
    const result=activation(feature,{...c,abilities:{...abilities}});
    const description=String(feature.catalogEntry?.payload?.描述??feature.description??'');
    const duplicate=feature.kind==='feat'&&seen.has(feature.name.trim())&&!spec?.repeatable&&!/复选|Repeatable|多次选择|多次选取/.test(description);
    if(result.active&&duplicate) {result.active=false;result.reason='相同专长不可重复获得（原文未允许复选）';}
    if(result.active&&feature.kind==='feat'&&feature.name.trim()) seen.add(feature.name.trim());
    activations.push({feature,...result});
    if(!spec) continue;
    const row={feature,key,spec,selected,applied:{},error:'',active:result.active};
    if(!result.active) row.error=result.reason;
    else if(selected.length!==spec.count||selected.some(id=>!spec.options.includes(id))) row.error=`请选择${spec.count}项属性；选择完整后才计入，原有基础值不改写`;
    else {
      for(const id of selected) {
        const amount=Math.max(0,Math.min(1,spec.cap-abilities[id]));
        abilities[id]+=amount;row.applied[id]=(row.applied[id]||0)+amount;
      }
      const changes=Object.entries(row.applied).map(([id,n])=>`${ABILITIES[id]} +${n}`).join('、');
      trace.push(`${feature.name}：${changes}（最高${spec.cap}）`);
      if(spec.savingThrow) {savingThrows.add(selected[0]);trace.push(`${feature.name}：${ABILITIES[selected[0]]}豁免熟练`);}
      if(Object.values(row.applied).reduce((a,b)=>a+b,0)<spec.count) row.error=`受属性上限${spec.cap}限制，部分提升未计入；可重新选择`;
    }
    if(row.error) issues.push(`${feature.name}：${row.error}`);
    rows.push(row);
  }
  const unassigned=features.filter(f=>f.kind==='feat'&&f.name?.trim()&&!f.advancementSource&&!f.sourceNote);
  if(unassigned.length) issues.push(`${unassigned.length}项专长未标明获得来源；请绑定职业奖励或填写种族、背景、团规等来源，不据此推断额外名额`);
  trace.push(...saving.trace);
  return {abilities,activations,rows,trace,issues,savingThrows:[...savingThrows],deathProficient:saving.deathProficient,slots:slots.map(s=>({...s,features:features.filter(f=>f.kind==='feat'&&f.advancementSource===s.id&&f.effectMode!=='off')}))};
}
