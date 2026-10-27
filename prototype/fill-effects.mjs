import { ABILITIES, SKILLS } from './content.mjs';
import { totalLevel, characterClasses } from './character-rules.mjs';

// A small data vocabulary, not a rule interpreter: no scripts or arbitrary expressions.
export const BONUS_TARGETS = {
  hp:'最大生命值', ac:'AC', initiative:'先攻', speed:'速度', spellDc:'法术 DC', spellAttack:'法术攻击',
  weaponAttack:'武器攻击加值', weaponDamage:'武器伤害加值',
  ...Object.fromEntries(Object.entries(ABILITIES).map(([id,name])=>['save:'+id,name+'豁免'])),
  ...Object.fromEntries(Object.entries(SKILLS).map(([id,s])=>['skill:'+id,s.name+'检定'])),
};
export const EFFECT_SCALES = { fixed:'固定值', level:'× 总等级', proficiency:'× 熟练加值', classLevel:'× 指定职业等级' };
export const GRANT_TYPES = {skill:'技能熟练', expertise:'技能专精', save:'豁免熟练', tool:'工具熟练', language:'语言', weapon:'武器熟练', armor:'护甲训练'};
export const EFFECT_TEMPLATES = {
  'dnd5e-2014': { 'feat:健壮':[{type:'bonus',target:'hp',value:2,scale:'level'}], 'feat:警觉':[{type:'bonus',target:'initiative',value:5}], },
  'dnd5r-2024': { 'feat:健壮':[{type:'bonus',target:'hp',value:2,scale:'level'}], 'feat:警觉':[{type:'bonus',target:'initiative',value:1,scale:'proficiency'}], 'feat:飙速跑者':[{type:'bonus',target:'speed',value:10}], },
};
const defense=[{type:'bonus',target:'ac',value:1,condition:'armored'}];
for(const templates of Object.values(EFFECT_TEMPLATES)) {
  templates['fighting:防御']=defense;
  templates['fighting:防御战斗风格']=defense;
}

export function normalizeFillEffects(value) {
  if(!Array.isArray(value)) return null; // null follows the template; [] explicitly removes it.
  return value.slice(0,32).flatMap(row=>{
    if(!row||typeof row!=='object') return [];
    if(row.type==='bonus') {
      if(!Object.hasOwn(BONUS_TARGETS,row.target)) return [];
      const number=Number(row.value);
      return [{type:'bonus',target:row.target,value:Number.isFinite(number)?Math.max(-9999,Math.min(9999,Math.trunc(number))):0,
        scale:Object.hasOwn(EFFECT_SCALES,row.scale)?row.scale:'fixed', classId:String(row.classId||'').slice(0,60),condition:row.condition==='armored'?'armored':'always'}];
    }
    if(!Object.hasOwn(GRANT_TYPES,row.type)) return [];
    const target=String(row.target||'').trim().slice(0,100);
    if(['skill','expertise'].includes(row.type)&&!Object.hasOwn(SKILLS,target)) return [];
    if(row.type==='save'&&!Object.hasOwn(ABILITIES,target)) return [];
    return [{type:row.type,target}];
  });
}

export function featureFillEffects(feature,ruleset) {
  return normalizeFillEffects(feature.fillEffects) ?? normalizeFillEffects(EFFECT_TEMPLATES[ruleset]?.[`${feature.kind}:${feature.name?.trim()}`]||[]);
}

export function collectFillEffects(c,features) {
  const bonuses=Object.fromEntries(Object.keys(BONUS_TARGETS).map(key=>[key,0]));
  const grants=Object.fromEntries(Object.keys(GRANT_TYPES).map(key=>[key,[]]));
  const trace=[],seenDefaults=new Set();
  const level=Math.max(1,Math.min(20,totalLevel(c))),pb=2+Math.floor((level-1)/4);
  for(const feature of features) {
    // Default named effects (including a background's origin feat) do not stack.
    const key=`${feature.kind}:${feature.name?.trim()}`;
    if(!Array.isArray(feature.fillEffects)) {
      if(seenDefaults.has(key)) continue;
      seenDefaults.add(key);
    }
    for(const effect of featureFillEffects(feature,c.ruleset)) {
      if(effect.type==='bonus') {
        if(effect.condition==='armored'&&c.armorId==='unarmored') continue;
        const factor=effect.scale==='level'?level:effect.scale==='proficiency'?pb:effect.scale==='classLevel'?characterClasses(c).find(row=>row.classId===effect.classId)?.level||0:1;
        const amount=effect.value*factor;
        bonuses[effect.target]+=amount;
        if(amount) trace.push(`${feature.name||'自定义特性'}：${BONUS_TARGETS[effect.target]} ${amount>=0?'+':''}${amount}${effect.scale!=='fixed'?`（${effect.value} ${EFFECT_SCALES[effect.scale]}）`:''}`);
      } else if(effect.target) {
        grants[effect.type].push(effect.target);
        trace.push(`${feature.name||'自定义特性'}：${GRANT_TYPES[effect.type]} · ${SKILLS[effect.target]?.name||ABILITIES[effect.target]||effect.target}`);
      }
    }
  }
  for(const key of Object.keys(grants)) grants[key]=[...new Set(grants[key])];
  return {bonuses,grants,trace};
}
