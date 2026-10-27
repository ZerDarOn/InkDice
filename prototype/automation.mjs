import { ABILITIES, CLASSES } from './content.mjs';
import { characterClasses, spellProgression, totalLevel, entryEligibility } from './character-rules.mjs';
import { characterEffects, effectiveProficiencies } from './effects.mjs';
import { hitDiceState, syncHitDice, planHitDiceRecovery } from './hit-dice.mjs';

const mod = n => Math.floor((Number(n || 10)-10)/2);
const sign = n => `${n >= 0 ? '+' : ''}${n}`;
const ranged = new Set('轻弩 短弓 飞镖 投石索 手弩 重弩 长弓 吹箭 火枪 手枪'.split(' '));
const simple = new Set('短棒 木棒 匕首 巨棒 手斧 标枪 轻锤 硬头锤 长棍 镰刀 矛 轻弩 短弓 飞镖 投石索'.split(' '));
const martial = new Set('战斧 链枷 长柄刀 巨斧 巨剑 戟 长戟 骑枪 巨锤 钉头锤 长矛 刺剑 细剑 弯刀 短剑 长剑 三叉戟 战锤 战镐 鞭 吹箭 手弩 重弩 长弓 网'.split(' '));

export function weaponCalculation(c,w) {
  const effects=characterEffects(c),abilities=effects.abilities;
  const pb=2+Math.floor((Math.min(totalLevel(c),20)-1)/4);
  const type=w.weaponType?.trim() || '';
  const profs=effectiveProficiencies(c).weapons;
  const known=simple.has(type)||martial.has(type)||ranged.has(type);
  const finesse=/灵巧/.test(w.properties||'');
  const ability=w.ability && ABILITIES[w.ability] ? w.ability : finesse ? mod(abilities.dex)>mod(abilities.str)?'dex':'str' : ranged.has(type)?'dex':known?'str':c.weaponAttackAbility||'str';
  const trained=profs.includes(type)||(simple.has(type)&&profs.includes('简易武器'))||(martial.has(type)&&profs.includes('军用武器'));
  const proficient=w.proficiencyMode==='manual'?Boolean(w.proficient):trained||Boolean(w.proficient);
  const magic=Number(w.bonus)||0;
  const archery=characterEffects(c).styles.has('箭术') && ranged.has(type) ? 2 : 0;
  const attackBonus=mod(abilities[ability])+magic+(proficient?pb:0)+archery+effects.fill.bonuses.weaponAttack;
  const damageBonus=mod(abilities[ability])+magic+effects.fill.bonuses.weaponDamage;
  const base=String(w.damageDie||'');
  // Preserve authored formulas; add modifiers only to a plain base damage die.
  const automaticDamage=/^\d+d\d+$/i.test(base.trim()) ? `${base} ${sign(damageBonus)}` : base;
  return { ability,proficient,attackBonus,damageBonus,attackDie:w.attackMode==='manual'?w.attackDie:`d20 ${sign(attackBonus)}`,damageDie:automaticDamage,
    note:`${ABILITIES[ability]} ${sign(mod(abilities[ability]))}；熟练 ${proficient?sign(pb):'+0'}；魔法 ${sign(magic)}${archery?'；箭术 +2':''}${effects.fill.bonuses.weaponAttack?`；来源攻击 ${sign(effects.fill.bonuses.weaponAttack)}`:''}${effects.fill.bonuses.weaponDamage?`；来源伤害 ${sign(effects.fill.bonuses.weaponDamage)}`:''}${known?'':'；非标准武器请核对属性与熟练'}` };
}

export function classMechanics(c,abilities) {
  const classes=characterClasses(c), r=c.ruleset==='dnd5r-2024';
  const level=id=>classes.find(x=>x.classId===id)?.level||0;
  let attacks=1;
  for(const item of classes) {
    if(['barbarian','fighter','monk','paladin','ranger'].includes(item.classId)&&item.level>=5) attacks=Math.max(attacks,item.classId==='fighter'?(item.level>=20?4:item.level>=11?3:2):2);
    if(item.level>=6&&((item.classId==='bard'&&/勇气|剑舞/.test(item.subclass))||(item.classId==='wizard'&&/剑咏/.test(item.subclass)))) attacks=Math.max(attacks,2);
    if(item.classId==='artificer'&&item.level>=5&&/战地铁匠|装甲师/.test(item.subclass)) attacks=Math.max(attacks,2);
  }
  const defenses=[];
  const dragon=classes.find(x=>x.classId==='sorcerer'&&/龙族术法|龙族血脉|Draconic/i.test(x.subclass)&&x.level>=(r?3:1));
  if(c.armorId==='unarmored') {
    const first=classes.find(x=>['monk','barbarian'].includes(x.classId));
    if(first?.classId==='barbarian') defenses.push({name:'野蛮人无甲防御',ac:10+mod(abilities.dex)+mod(abilities.con)+(c.shield?Number(c.shieldAcBonus??2):0)});
    if(first?.classId==='monk'&&!c.shield) defenses.push({name:'武僧无甲防御',ac:10+mod(abilities.dex)+mod(abilities.wis)});
    if(dragon) defenses.push({name:'龙族体魄',ac:(r?10+mod(abilities.cha):13)+mod(abilities.dex)+(c.shield?Number(c.shieldAcBonus??2):0)});
    if(r&&!c.shield&&classes.some(x=>x.classId==='bard'&&x.level>=3&&/舞蹈学院/.test(x.subclass))) defenses.push({name:'炫目舞步无甲防御',ac:10+mod(abilities.dex)+mod(abilities.cha)});
  }
  const jack=level('bard')>=2;
  const expertise=(level('rogue')>=1?2:0)+(level('rogue')>=6?2:0)+(level('bard')>=(r?2:3)?2:0)+(level('bard')>=(r?9:10)?2:0)+(r&&level('ranger')>=2?1:0)+(r&&level('ranger')>=9?2:0);
  const artificer=level('artificer');
  const attunementLimit=artificer>=18?6:artificer>=14?5:artificer>=10?4:r&&classes.some(x=>x.classId==='rogue'&&x.level>=13&&/盗贼|窃贼|Thief/i.test(x.subclass))?4:3;
  return { attacks,defenses,jack,jackInitiative:jack&&!r,expertise,attunementLimit,hpBonus:dragon?.level||0 };
}

// Prepared counts: official 2024 class tables; known counts: 2014 class tables.
// These limits exclude always-prepared grants. Wizard spellbook size has no cap.
const full2024=[4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22];
const wizard2024=[4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25];
const half2024=[2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15];
const known2014={
  bard:[4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
  sorcerer:[2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
  ranger:[0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
  warlock:[2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
  third:[0,0,3,4,4,4,5,6,6,7,8,8,9,10,10,11,11,11,12,13],
};
export function spellCapacity(c) {
  const abilities=characterEffects(c).abilities, r=c.ruleset==='dnd5r-2024';
  const casters=spellProgression(c).classes.filter(x=>x.kind!=='none');
  return casters.map(item=>{
    const id=item.classId,l=item.level;
    let limit=null,mode='准备';
    if(item.kind==='third') {limit=known2014.third[l-1];mode=r?'准备':'已知';}
    else if(id==='artificer') limit=Math.max(1,Math.floor(l/2)+mod(abilities.int));
    else if(r) limit=id==='wizard'?wizard2024[l-1]:['paladin','ranger'].includes(id)?half2024[l-1]:id==='warlock'?known2014.warlock[l-1]:id==='sorcerer'&&l<=2?l*2:full2024[l-1];
    else if(['cleric','druid','wizard','paladin'].includes(id)) limit=Math.max(1,(id==='paladin'?Math.floor(l/2):l)+mod(abilities[item.ability]));
    else {limit=known2014[id]?.[l-1]??null;mode='已知';}
    const spells=(c.spells||[]).filter(s=>s.name.trim()&&s.level>0&&!s.alwaysPrepared&&(s.castingClassId===id||(!s.castingClassId&&casters.length===1))&&(mode==='已知'||s.prepared));
    const count=new Set(spells.map(s=>s.name.trim())).size;
    return {...item,mode,limit,count,over:limit!==null&&count>limit};
  });
}

export function resourceDefinitions(c) {
  const effects=characterEffects(c), r=c.ruleset==='dnd5r-2024', result=[];
  const add=(id,name,max,short=0,detail='')=>result.push({id,name,maximum:max,short,detail,current:Math.max(0,max-Math.max(0,Number(c.resourceSpent?.[id])||0))});
  for(const {classId:id,level:l} of characterClasses(c)) {
    if(id==='fighter') {
      add('secondWind','回气',r?(l>=10?4:l>=4?3:2):1,r?1:Infinity,'短休恢复'+(r?'1次':'全部')+'，长休全部');
      if(l>=2) add('actionSurge','动作如潮',l>=17?2:1,Infinity,'短休或长休恢复全部');
      if(l>=9) add('indomitable','不屈',l>=17?3:l>=13?2:1,0,'长休恢复全部');
    }
    if(id==='monk'&&l>=2) add('focus',r?'专注点':'气',l,Infinity,'短休或长休恢复全部');
    if(id==='sorcerer'&&l>=2) add('sorcery','术法点',l,0,'长休恢复；术法复苏需另行确认条件');
    if(id==='bard') add('bardicInspiration','吟游激励',Math.max(1,mod(effects.abilities.cha)),l>=5?Infinity:0,l>=5?'短休或长休恢复全部':'长休恢复全部');
    if(id==='paladin') {
      add('layOnHands','圣疗池',5*l,0,'长休恢复全部');
      if(l>=3&&r) add('paladinChannel','圣武士引导神力',l>=11?3:2,1,'短休恢复1次，长休全部');
    }
    if(id==='cleric'&&l>=2&&r) add('clericChannel','牧师引导神力',l>=18?4:l>=6?3:2,1,'短休恢复1次，长休全部');
    if(id==='druid'&&l>=2&&!(l===20&&!r)) add('wildShape','荒野形态',r?(l>=17?4:l>=6?3:2):2,r?1:Infinity,r?'短休恢复1次，长休全部':'短休或长休恢复全部');
    if(id==='barbarian'&&!(l===20&&!r)) add('rage','狂暴',l>=17?6:l>=12?5:l>=6?4:l>=3?3:2,r?1:0,r?'短休恢复1次，长休全部':'长休恢复全部');
  }
  if(!r) {
    const classes=characterClasses(c), cleric=classes.find(x=>x.classId==='cleric')?.level||0, paladin=classes.find(x=>x.classId==='paladin')?.level||0;
    if(cleric>=2||paladin>=3) add('channelDivinity','引导神力（共享）',cleric>=18?3:cleric>=6?2:1,Infinity,'5e 兼职共享次数，不相加；短休或长休恢复全部');
  }
  return result;
}

export function loadSummary(c) {
  const str=characterEffects(c).abilities.str;
  const factor=({'微型':0.5,'小型':1,'中型':1,'大型':2,'巨型':4,'超巨型':8})[c.size]??1;
  const capacity=c.carryingCapacity??str*15*factor;
  const inventory=(c.inventory||[]).reduce((n,i)=>n+Math.max(0,Number(i.weight)||0)*Math.max(0,Number(i.quantity)||0),0);
  const coins=Object.values(c.currency||{}).reduce((n,v)=>n+Math.max(0,Number(v)||0),0)/50;
  // Manual total is kept until an explicit equipment/inventory ownership model exists.
  const equipment=Number(c.equipmentLoad)||0;
  return {capacity,inventory,coins,equipment,total:inventory+coins+equipment,over:inventory+coins+equipment>capacity,manualEquipment:c.equipmentLoad!=null};
}

export function castSpell(c,spellId,{pool='slot',rank,replaceConcentration=false}={}) {
  const spell=c.spells.find(s=>s.id===spellId);
  if(!spell?.name?.trim()) throw new Error('请先选择法术。');
  const capacity=spellCapacity(c), source=capacity.find(x=>x.classId===spell.castingClassId)||(spell.castingClassId?null:capacity.length===1?capacity[0]:null);
  if(spell.castingClassId&&spell.castingClassId!=='other'&&!source) throw new Error('此法术的施法职业已不存在，请先核对学习来源。');
  if(source&&spell.level>source.maxRank) throw new Error('超过该职业可学环阶；特殊授予请明确改为其他来源。');
  if(source&&spell.classes?.trim()) {
    const eligible=entryEligibility({kind:'spell',rank:spell.level,payload:{职业列表:spell.classes.split(/[\s、,，/]+/)}},c,{castingClassId:source.classId});
    if(eligible.status==='blocked') throw new Error(eligible.failures.join('；'));
  }
  if(spell.level>0&&source?.mode==='准备'&&!spell.prepared&&!spell.alwaysPrepared) throw new Error('此法术尚未准备。');
  if(spell.concentration&&c.concentrationSpellId&&c.concentrationSpellId!==spell.id&&!replaceConcentration) throw new Error('已有专注法术；请确认结束旧专注后再施放。');
  let slot;
  if(spell.level>0) {
    slot=pool==='pact'?c.pactSlots:c.spellSlots?.[rank];
    const actualRank=pool==='pact'?slot?.level:Number(rank);
    if(!slot||!Number.isInteger(actualRank)||actualRank<spell.level||actualRank>9||slot.current<1) throw new Error('没有可用的对应环阶法术位。');
  }
  if(slot) slot.current-=1;
  if(spell.concentration) c.concentrationSpellId=spell.id;
  return `${spell.name}：${slot?'已消耗1个'+(pool==='pact'?'契约位':rank+'环法术位'):'戏法不消耗法术位'}`;
}

export function completeRest(c,type,maxHp,{hitDiceRecovery}={}) {
  if(!['short','long'].includes(type)) throw new Error('无效休息类型');
  if(type==='long'&&c.currentHp<1) throw new Error('长休开始时须至少有1点生命值；请先核对当前生命。');
  const long=type==='long';
  const recovered=long?planHitDiceRecovery(c,hitDiceRecovery):null;
  for(const resource of resourceDefinitions(c)) {
    const spent=Math.max(0,resource.maximum-resource.current);
    c.resourceSpent||={};c.resourceSpent[resource.id]=long?0:Math.max(0,spent-resource.short);
  }
  if(c.pactSlots) c.pactSlots.current=c.pactSlots.maximum;
  if(long) {
    for(const slot of Object.values(c.spellSlots||{})) slot.current=slot.maximum;
    c.currentHp=maxHp;c.tempHp=0;c.concentrationSpellId=null;
    c.hitDiceSpent={...(c.hitDiceSpent||{}),...recovered};syncHitDice(c);
  }
  const activations=characterEffects(c).activations;
  for(const {feature:f,active} of activations) {
    if(!active) continue;
    const recovery=String(f.recovery||'').replace(/\s/g,'');
    if(['短休','短休/长休','短休或长休'].includes(recovery)||(long&&recovery==='长休')) f.current=f.maximum;
  }
  return long?'长休完成：生命、法术位和对应资源已恢复。':'短休完成：契约位和对应资源已恢复；生命值未自动回满。';
}

export function spendHitDie(c,classId,roll,maxHp) {
  const state=hitDiceState(c),pool=state.pools.find(p=>p.classId===classId);
  if(state.pending) throw new Error('请先分配旧卡生命骰到各职业。');
  if(!pool||pool.current<1) throw new Error('此职业没有可用生命骰。');
  const die=pool.die;
  if(!Number.isInteger(roll)||roll<1||roll>die) throw new Error(`请输入实际掷出的1–${die}。`);
  const heal=Math.max(0,roll+mod(characterEffects(c).abilities.con));
  syncHitDice(c);c.hitDiceSpent[classId]+=1;syncHitDice(c);
  const actual=Math.max(0,Math.min(maxHp-Number(c.currentHp),heal));c.currentHp=Number(c.currentHp)+actual;
  return `${CLASSES[classId].name}消耗1d${die}；本次恢复 ${actual} 生命。`;
}
