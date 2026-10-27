import {CLASSES,SKILLS,RULESETS} from './content.mjs';
import {deriveMvpCharacter} from './model.mjs';
import {deriveCoc,skillName,skillValue} from './coc/model.mjs';
const text=(v,n=500)=>String(v??'').slice(0,n);
const fields=(record,keys)=>Object.fromEntries(keys.filter(k=>record?.[k]!=null).map(k=>[k,typeof record[k]==='number'||typeof record[k]==='boolean'?record[k]:text(record[k],1000)]));
const rows=(items,keys,limit=30)=>(items||[]).slice(0,limit).map(r=>fields(r,keys));
export function cardContext(c){
  if(!c||!RULESETS[c.ruleset])throw Error('请先选择人物卡');
  const card={id:text(c.id,100),ruleset:c.ruleset,name:text(c.name,80),system:RULESETS[c.ruleset].shortName};
  card.摘要范围='仅提供列出的字段；长列表最多 30 条、CoC 技能最多 100 项、随身物品最多 20 条。未列出不等于人物没有该内容。';
  if(c.ruleset==='coc-7e'){
    const d=deriveCoc(c);
    Object.assign(card,{职业:text(c.occupation),年龄:c.age,时代:c.era,属性:{...c.attributes},派生值:fields(d,['hp','hpMax','mp','mpMax','san','sanMax','mov','db','build','occupationPoints','interestPoints','occupationRemaining','interestRemaining']),技能:c.skills.slice(0,100).map(s=>({名称:skillName(s),总值:skillValue(c,s).total,职业点:s.occupation,兴趣点:s.interest})),武器:rows(c.weapons,['name','skill','chance','damage','range','ammo']),背景:text(c.story,1500),防护:fields(c,['armorName','armor','armorPenalty','applyArmorPenalty']),神话法术:rows(c.spells,['name','cost','effect'])});
  }else{
    const d=deriveMvpCharacter(c);
    Object.assign(card,{职业:[{名称:CLASSES[c.classId]?.name||c.classId,等级:c.level,子职业:text(c.subclass)},...(c.multiclasses||[]).map(x=>({名称:CLASSES[x.classId]?.name||x.classId,等级:x.level,子职业:text(x.subclass)}))],种族:text(c.species),亚种:text(c.subrace),背景:text(c.background),基础属性:{...c.abilities},生效属性:{...d.effects.abilities},派生值:fields(d,['armorClass','hitPoints','initiative','proficiencyBonus','passivePerception','spellSaveDc','spellAttackBonus']),当前生命:c.currentHp,临时生命:c.tempHp,施法:fields(d.spellcasting,['saveDc','attackBonus','ability']),计算依据:d.effects.trace.slice(0,20),豁免:d.savingThrows,技能:Object.fromEntries(Object.entries(d.skills||{}).map(([k,v])=>[SKILLS[k]?.name||k,v])),能力:rows(c.featureEntries,['kind','name','level','description']),法术:rows(c.spells,['name','level','prepared','castingClassId','effect']),武器:rows(c.weapons,['name','weaponType','damageDie','damageType','properties']),奇物:rows(c.curios,['name','rarity','properties','attuned']),背景故事:text(c.backgroundStory,1500)});
  }
  if(c.ruleset!=='coc-7e'){
    card.护甲盾牌=fields(c,['armorId','equipmentArmor','armorBonus','armorProperty','shield','shieldName','shieldAcBonus','shieldAttuned']);
    card.熟练与语言=fields(c,['weaponProficiencies','armorTraining','knownLanguages','toolProficiencies']);
    card.法术位=c.spellSlots;card.契约法术位=c.pactSlots;card.钱币=c.currency;card.剩余生命骰=c.hitDiceCurrent;
  }
  card.随身物品=rows(c.ruleset==='coc-7e'?c.items:c.inventory,['name','quantity','description'],20);
  // Deliberate allowlist: no portraits, player identity, API settings or unrelated cards.
  while(JSON.stringify(card).length>26000){const key=['能力','法术','奇物','武器','随身物品','技能','神话法术'].filter(k=>Array.isArray(card[k])&&card[k].length).sort((a,b)=>JSON.stringify(card[b]).length-JSON.stringify(card[a]).length)[0];if(!key)break;card[key].pop();card.摘要说明='长列表已截取，未提供全部条目。';}
  return card;
}
const stop=new Set('怎么 如何 可以 是否 这个 那个 什么 我的 当前 人物 角色 帮我 为什么 一个 进行 以及 哪些 多少 根据 规则 使用'.split(' '));
export function retrievalQueries(question,card){
  const q=text(question,2000),found=[];
  const add=v=>{v=String(v||'').trim();if(v.length>=2&&v.length<=80&&!stop.has(v)&&!found.includes(v))found.push(v);};
  [...q.matchAll(/[“「『"]([^”」』"]{2,60})[”」』"]/g)].forEach(m=>add(m[1]));
  for(const key of ['种族','亚种','背景'])if(typeof card[key]==='string'&&q.includes(card[key]))add(card[key]);
  for(const key of ['能力','法术','武器','奇物'])for(const r of card[key]||[])if(r.name&&q.includes(r.name))add(r.name);
  if(q.length<=20)add(q.replace(/[？?！!。]/g,''));
  const words=[...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(q)].filter(s=>s.isWordLike).map(s=>s.segment);
  // Adjacent terms help names such as 火球 + 术 remain searchable.
  for(let i=0;i<words.length-1;i++)if(words[i+1].length===1&&words[i].length>=2)add(words[i]+words[i+1]);
  words.forEach(add);
  if(found.length<6){add(card.种族);add(card.背景);if(typeof card.职业==='string')add(card.职业);else card.职业?.forEach(c=>{add(c.子职业);add(c.名称);});}
  return found.slice(0,8);
}
export function sourceExcerpt(entry){
  const parts=Object.entries(entry.payload||{}).filter(([k,v])=>k!=='规则关联'&&v!=null&&v!=='').map(([k,v])=>`${k}：${typeof v==='object'?JSON.stringify(v):v}`);
  const content=parts.join('\n');
  return {id:text(entry.id,180),ruleset:entry.ruleset,name:text(entry.name,120),book:text(entry.provenance?.book||entry.sourceBook||entry.sourceFile,160),sourceType:text(entry.provenance?.groupLabel||(entry.sourceGroup==='workbook'?'用户提供工作簿':'来源待核'),80),kind:text(entry.kind,40),text:content.length>3200?'（正文过长，以下为截取片段，未提供全部内容）\n'+content.slice(0,3100):content};
}
export async function retrieveContext(question,card,read,{signal}={}){
  const queries=retrievalQueries(question,card),sources=[],ids=new Set();let failures=0;
  for(const query of queries){
    signal?.throwIfAborted();
    try{const data=await read('/api/library/search?'+new URLSearchParams({ruleset:card.ruleset,query,limit:'3'}));
      for(const hit of data.results||[]){if(ids.has(hit.id))continue;const entry=await read('/api/library/entry?'+new URLSearchParams({ruleset:card.ruleset,id:hit.id}));if(entry.ruleset!==card.ruleset)continue;ids.add(hit.id);sources.push({...sourceExcerpt(entry),citation:`S${sources.length+1}`});if(sources.length>=8)break;}
    }catch(error){if(signal?.aborted)throw error;failures++;}
    if(sources.length>=8)break;
  }
  signal?.throwIfAborted();
  return {sources,queries,status:failures?'部分资料查询失败；回答不能视为完整检索。':sources.length?'已检索当前系统的本机资料。':'本机资料未检索到匹配；只可参考当前卡，缺少出处时须说明。'};
}
