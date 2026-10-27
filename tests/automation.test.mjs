import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, deriveMvpCharacter, normalizeCharacter, exportDocument, importDocument, validateCharacter } from '../prototype/model.mjs';
import { characterEffects,featureActivation } from '../prototype/effects.mjs';
import { weaponCalculation,classMechanics,spellCapacity,resourceDefinitions,castSpell,completeRest,spendHitDie,loadSummary } from '../prototype/automation.mjs';
import { syncCharacterSlots } from '../prototype/character-rules.mjs';
import { creaturePatchFromEntry,mergeCreatureEntry } from '../prototype/suggestions.mjs';

test('catalog effects revoke after class change, and a style cannot grant itself',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'fighter',armorId:'leather'});
  c.featureEntries=[{kind:'fighting',name:'防御战斗风格',catalogEntry:{name:'防御战斗风格',kind:'fighting_style',ruleset:c.ruleset,payload:{分类:'战斗风格'}}}];
  assert.equal(characterEffects(c).defenseBonus,1);
  c.classId='wizard';assert.equal(characterEffects(c).defenseBonus,0);
  c.featureEntries[0].effectMode='confirmed';assert.equal(characterEffects(c).defenseBonus,0);
  assert.ok(characterEffects(c).activations[0].reason);
});
test('unknown prerequisites require confirmation, explicit failures cannot be overridden',()=>{
  const c=createCharacter({classId:'fighter',level:2});
  const f={kind:'feat',name:'健壮',catalogEntry:{kind:'feat',payload:{描述:'先决条件：某种背景'}}};
  assert.equal(featureActivation(f,c).active,false);f.effectMode='confirmed';assert.equal(featureActivation(f,c).active,true);
  f.effectMode='off';assert.equal(featureActivation(f,c).active,false);
  f.effectMode='confirmed';f.catalogEntry.payload.描述='先决条件：4级';assert.equal(featureActivation(f,c).active,false);
});
test('weapons use type, finesse, proficiency, magic and style without accumulating bonuses',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'fighter',level:5,abilities:{str:14,dex:18,con:12,int:10,wis:10,cha:10}});
  const w={weaponType:'长弓',damageDie:'1d8',bonus:1};
  assert.equal(weaponCalculation(c,w).attackDie,'d20 +8');assert.equal(weaponCalculation(c,w).damageDie,'1d8 +5');
  assert.equal(w.damageDie,'1d8');c.featureEntries=[{kind:'fighting',name:'箭术'}];
  assert.equal(weaponCalculation(c,w).attackDie,'d20 +10');
  assert.equal(weaponCalculation(c,{weaponType:'匕首',properties:'灵巧，投掷',damageDie:'1d4'}).ability,'dex');
  assert.equal(weaponCalculation(c,{weaponType:'标枪',properties:'投掷'}).ability,'str');
  c.classId='wizard';c.featureEntries=[];assert.equal(weaponCalculation(c,w).proficient,false);
});
test('weapon manual overrides survive normalization and do not change damage formulas',()=>{
  const c=normalizeCharacter({weapons:[{weaponType:'长弓',attackDie:'d20 +99',damageDie:'1d8+12',proficiencyMode:'manual',proficient:false}]});
  assert.equal(weaponCalculation(c,c.weapons[0]).attackDie,'d20 +99');assert.equal(weaponCalculation(c,c.weapons[0]).damageDie,'1d8+12');
  c.weapons[0].attackMode='auto';assert.notEqual(weaponCalculation(c,c.weapons[0]).attackDie,'d20 +99');
});
test('unarmored defenses do not stack, monk disallows shield and armor ends both',()=>{
  const c=createCharacter({classId:'monk',armorId:'unarmored',abilities:{str:10,dex:16,con:18,int:10,wis:14,cha:10}});
  assert.equal(deriveMvpCharacter(c).armorClass,15);
  c.multiclasses=[{classId:'barbarian',level:1}];assert.equal(deriveMvpCharacter(c).armorClass,15);
  c.shield=true;assert.equal(deriveMvpCharacter(c).armorClass,15); // ordinary 10+3+2, not 15+2
  c.classId='barbarian';c.multiclasses=[];assert.equal(deriveMvpCharacter(c).armorClass,19);
  c.armorId='leather';assert.equal(deriveMvpCharacter(c).armorClass,16);
});
test('Jack of All Trades affects only untrained checks; 2024 excludes initiative',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'bard',level:5,skills:{athletics:2}});
  const d=deriveMvpCharacter(c);assert.equal(d.skills.arcana,1);assert.equal(d.skills.athletics,5);assert.equal(d.initiative,3);
  c.ruleset='dnd5r-2024';assert.equal(deriveMvpCharacter(c).initiative,2);
});
test('extra attacks do not stack and artificer attunement scales',()=>{
  const c=createCharacter({classId:'fighter',level:11,multiclasses:[{classId:'paladin',level:5}]});
  assert.equal(classMechanics(c,c.abilities).attacks,3);
  c.classId='artificer';c.level=18;c.multiclasses=[];assert.equal(classMechanics(c,c.abilities).attunementLimit,6);
});
test('spell caps are per class and edition, not shared caster level or ability in 2024',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'wizard',level:3,abilities:{int:16},multiclasses:[{classId:'cleric',level:1}]});
  assert.equal(spellCapacity(c)[0].limit,6);
  c.ruleset='dnd5r-2024';c.level=20;c.multiclasses=[];assert.equal(spellCapacity(c)[0].limit,25);
  c.classId='sorcerer';assert.equal(spellCapacity(c)[0].limit,22);
  c.classId='paladin';assert.equal(spellCapacity(c)[0].limit,15);
});
test('extra prepared spells and duplicates do not consume the cap; unknown-source spells remain separate',()=>{
  const c=createCharacter({classId:'wizard',spells:[{name:'甲',level:1,prepared:true,castingClassId:'wizard'},{name:'甲',level:1,prepared:true,castingClassId:'wizard'},{name:'乙',level:1,prepared:true,alwaysPrepared:true,castingClassId:'wizard'},{name:'丙',level:1,prepared:true,castingClassId:'other'}]});
  assert.equal(spellCapacity(c)[0].count,1);
});
test('cast validates before mutating resources and requires explicit concentration replacement',()=>{
  const c=createCharacter({classId:'wizard',level:3});syncCharacterSlots(c,{preserveSpent:false});
  c.spells=[{id:'a',name:'甲',level:1,prepared:false,castingClassId:'wizard',concentration:true}];
  assert.throws(()=>castSpell(c,'a',{rank:1}),/尚未准备/);assert.equal(c.spellSlots[1].current,4);
  c.spells[0].prepared=true;c.concentrationSpellId='old';
  assert.throws(()=>castSpell(c,'a',{rank:1}),/确认/);assert.equal(c.spellSlots[1].current,4);
  castSpell(c,'a',{rank:2,replaceConcentration:true});assert.equal(c.spellSlots[2].current,1);assert.equal(c.concentrationSpellId,'a');
  c.spellSlots[2].current=0;assert.throws(()=>castSpell(c,'a',{rank:2}),/没有可用/);assert.equal(c.spellSlots[2].current,0);
});
test('pact casting spends only pact pool and cantrips cost nothing',()=>{
  const c=createCharacter({classId:'warlock',level:3});syncCharacterSlots(c,{preserveSpent:false});
  c.spells=[{id:'a',name:'甲',level:1,prepared:true,castingClassId:'warlock'}];castSpell(c,'a',{pool:'pact'});assert.equal(c.pactSlots.current,1);
  c.spells[0].level=0;castSpell(c,'a');assert.equal(c.pactSlots.current,1);
});
test('rest uses edition-specific recovery and never heals HP on a short rest',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'fighter',level:5,currentHp:3,hitDiceCurrent:0});
  c.resourceSpent={secondWind:1,actionSurge:1};completeRest(c,'short',40);assert.equal(c.currentHp,3);assert.equal(c.resourceSpent.secondWind,0);
  completeRest(c,'long',40);assert.equal(c.currentHp,40);assert.equal(c.hitDiceCurrent,2);
  c.ruleset='dnd5r-2024';c.hitDiceCurrent=0;c.resourceSpent={secondWind:3};completeRest(c,'short',40);assert.equal(c.resourceSpent.secondWind,2);
  completeRest(c,'long',40);assert.equal(c.hitDiceCurrent,5);
});
test('long rest cannot silently revive a zero-HP character and custom recovery is explicit',()=>{
  const c=createCharacter({currentHp:0});assert.throws(()=>completeRest(c,'long',20),/至少/);
  c.currentHp=1;c.featureEntries=[{name:'甲',kind:'special',current:0,maximum:3,recovery:'长休'},{name:'乙',kind:'special',current:0,maximum:3,recovery:'特殊条件后长休'}];
  completeRest(c,'long',20);assert.equal(c.featureEntries[0].current,3);assert.equal(c.featureEntries[1].current,0);
});
test('hit die healing uses submitted die result and Constitution, rejects invalid rolls',()=>{
  const c=createCharacter({classId:'fighter',level:2,currentHp:1,hitDiceCurrent:2,abilities:{con:14}});
  spendHitDie(c,'fighter',8,20);assert.equal(c.currentHp,11);assert.equal(c.hitDiceCurrent,1);
  assert.throws(()=>spendHitDie(c,'fighter',11,20));assert.equal(c.hitDiceCurrent,1);
});
test('resource spent counts survive level changes and export, load uses strength and size',()=>{
  const c=createCharacter({classId:'monk',level:3,resourceSpent:{focus:2},inventory:[{quantity:2,weight:5}],currency:{gp:100},size:'大型',abilities:{str:12}});
  c.level=5;assert.equal(resourceDefinitions(c)[0].current,3);
  assert.equal(importDocument(exportDocument(c)).resourceSpent.focus,2);
  assert.equal(loadSummary(c).capacity,360);assert.equal(loadSummary(c).total,12);
  c.carryingCapacity=0;assert.equal(loadSummary(c).capacity,0);assert.ok(validateCharacter(c).some(i=>i.field==='carryingCapacity'));
  assert.equal(importDocument(exportDocument(c)).carryingCapacity,0);
});

test('2014 channel divinity shares a pool; 2024 pools stay class-specific',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'cleric',level:6,multiclasses:[{classId:'paladin',level:4}]});
  const pools=resourceDefinitions(c).filter(x=>/引导神力/.test(x.name));
  assert.equal(pools.length,1);assert.equal(pools[0].maximum,2);
  c.resourceSpent={channelDivinity:2};completeRest(c,'short',40);assert.equal(c.resourceSpent.channelDivinity,0);
  c.ruleset='dnd5r-2024';assert.equal(resourceDefinitions(c).filter(x=>/引导神力/.test(x.name)).length,2);
});
test('2014 level-20 unlimited resources are not capped at earlier levels',()=>{
  for(const id of ['druid','barbarian']) {
    const c=createCharacter({ruleset:'dnd5e-2014',classId:id,level:20});assert.equal(resourceDefinitions(c).length,0);
    c.ruleset='dnd5r-2024';assert.equal(resourceDefinitions(c).length,1);
  }
});
test('draconic defenses and hit points honor subclass level and edition',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'sorcerer',level:2,subclass:'龙族术法',armorId:'unarmored',abilities:{dex:14,cha:18}});
  assert.equal(classMechanics(c,c.abilities).hpBonus,2);assert.equal(deriveMvpCharacter(c).armorClass,15);
  c.ruleset='dnd5r-2024';assert.equal(classMechanics(c,c.abilities).hpBonus,0);
  c.level=3;assert.equal(classMechanics(c,c.abilities).hpBonus,3);assert.equal(deriveMvpCharacter(c).armorClass,16);
});
test('creature source changes update defaults without overwriting handwritten fields',()=>{
  const entry={name:'猫',payload:{HP:2,AC:12,概览:'感官：黑暗视觉60尺\nCR 0',六维:{str:3,dex:15}}};
  assert.equal(creaturePatchFromEntry(entry).challengeRating,'0');
  const record={name:'',armorClass:10,hitPoints:1,currentHitPoints:1,abilities:{str:10,dex:18}};
  mergeCreatureEntry(record,entry);assert.equal(record.hitPoints,2);assert.equal(record.abilities.str,3);assert.equal(record.abilities.dex,18);
  mergeCreatureEntry(record,{name:'另一生物',payload:{HP:10,AC:13,六维:{str:12,dex:14}}});
  assert.equal(record.hitPoints,10);assert.equal(record.abilities.str,12);assert.equal(record.abilities.dex,18);
});
test('casting off-list spells fails without consuming a slot',()=>{
  const c=createCharacter({classId:'cleric',level:3});syncCharacterSlots(c,{preserveSpent:false});
  c.spells=[{id:'a',name:'护盾术',level:1,classes:'法师 术士',prepared:true,castingClassId:'cleric'}];
  assert.throws(()=>castSpell(c,'a',{rank:1}),/法术表/);assert.equal(c.spellSlots[1].current,4);
});
