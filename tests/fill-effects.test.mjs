import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter,normalizeCharacter,deriveMvpCharacter,exportDocument,importDocument} from '../prototype/model.mjs';
import {characterEffects,effectiveProficiencies,featureActivation} from '../prototype/effects.mjs';
import {featureFillEffects,normalizeFillEffects} from '../prototype/fill-effects.mjs';
import {renderFillEffectEditor} from '../prototype/fill-effect-editor.mjs';
import {weaponCalculation} from '../prototype/automation.mjs';
const bonus=(target,value,scale='fixed',extra={})=>({type:'bonus',target,value,scale,...extra});
const custom=(fillEffects)=>({id:'test-effect',kind:'special',name:'团规特性',fillEffects});

test('both editions use shared templates and Tough updates with multiclass levels',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const c=createCharacter({ruleset,classId:'fighter',level:4,multiclasses:[{classId:'rogue',level:2}]});
    c.featureEntries=[{kind:'feat',name:'健壮'},{kind:'feat',name:'警觉'}];
    assert.equal(characterEffects(c).hpBonus,12);
    assert.equal(characterEffects(c).initiativeBonus,ruleset==='dnd5e-2014'?5:3);
    c.level=5;assert.equal(characterEffects(c).hpBonus,14);
  }
});
test('custom templates replace defaults, explicit empty disables, reset follows template again',()=>{
  const c=createCharacter({level:5});
  c.featureEntries=[{kind:'feat',name:'健壮',fillEffects:[bonus('hp',3,'level')]}];
  assert.equal(characterEffects(c).hpBonus,15);
  c.featureEntries[0].fillEffects=[];assert.equal(characterEffects(c).hpBonus,0);
  c.featureEntries[0].fillEffects=null;assert.equal(characterEffects(c).hpBonus,10);
});
test('background Tough is not applied twice or bypassed when its explicit feature is disabled',()=>{
  const c=createCharacter({level:4,background:'士兵'});
  c.backgroundSource={name:c.background,ruleset:c.ruleset,payload:{专长:'健壮'}};
  assert.equal(characterEffects(c).hpBonus,8);
  c.featureEntries=[{kind:'feat',name:'健壮',fillEffects:[bonus('hp',3,'level')]}];
  assert.equal(characterEffects(c).hpBonus,12);
  c.featureEntries[0].effectMode='off';assert.equal(characterEffects(c).hpBonus,0);
  c.featureEntries[0].sourceRuleset='dnd5e-2014';assert.equal(characterEffects(c).hpBonus,8);
});
test('numeric vocabulary reaches derived stats and leaves stored base fields unchanged',()=>{
  const c=createCharacter({classId:'wizard',level:5});const base=deriveMvpCharacter(c),snapshot=JSON.stringify(c);
  c.featureEntries=[custom([bonus('hp',2,'level'),bonus('ac',1),bonus('initiative',1,'proficiency'),bonus('speed',10),bonus('spellDc',2),bonus('spellAttack',1),bonus('save:con',2),bonus('skill:perception',3)])];
  const result=deriveMvpCharacter(c);
  assert.equal(result.hitPoints,base.hitPoints+10);assert.equal(result.armorClass,base.armorClass+1);
  assert.equal(result.initiative,base.initiative+3);assert.equal(result.speed,base.speed+10);
  assert.equal(result.spellcasting.saveDc,base.spellcasting.saveDc+2);assert.equal(result.spellcasting.attackBonus,base.spellcasting.attackBonus+1);
  assert.equal(result.savingThrows.con,base.savingThrows.con+2);assert.equal(result.passivePerception,base.passivePerception+3);
  c.featureEntries=[];assert.equal(JSON.stringify(c),snapshot);assert.equal(deriveMvpCharacter(c).hitPoints,base.hitPoints);
});
test('class-scaled and armored effects respond to the chosen class and equipment',()=>{
  const c=createCharacter({classId:'fighter',level:5,multiclasses:[{classId:'wizard',level:2}],armorId:'unarmored'});
  c.featureEntries=[custom([bonus('hp',2,'classLevel',{classId:'wizard'}),bonus('ac',1,'fixed',{condition:'armored'})])];
  assert.equal(characterEffects(c).hpBonus,4);assert.equal(characterEffects(c).defenseBonus,0);
  c.armorId='leather';assert.equal(characterEffects(c).defenseBonus,1);
  c.multiclasses=[];assert.equal(characterEffects(c).hpBonus,0);
});
test('grants share a vocabulary, use max proficiency instead of stacking, and revoke by source',()=>{
  const c=createCharacter({classId:'wizard',skills:{athletics:1}});
  c.featureEntries=[custom([{type:'expertise',target:'athletics'},{type:'skill',target:'stealth'},{type:'save',target:'con'},
    {type:'tool',target:'炼金工具'},{type:'language',target:'龙语'},{type:'weapon',target:'军用武器'},{type:'armor',target:'重甲'}])];
  const e=characterEffects(c),p=effectiveProficiencies(c);
  assert.equal(e.skillGrants.ranks.athletics,2);assert.equal(e.skillGrants.ranks.stealth,1);assert.ok(e.advancement.savingThrows.includes('con'));
  assert.match(p.tools,/炼金工具/);assert.match(p.languages,/龙语/);assert.ok(p.weapons.includes('军用武器'));assert.match(p.armor,/重甲/);
  c.featureEntries=[];assert.equal(characterEffects(c).skillGrants.ranks.athletics,1);assert.ok(!characterEffects(c).advancement.savingThrows.includes('con'));
});
test('manual confirmation bypasses eligibility, never edition boundaries; off always withdraws',()=>{
  const c=createCharacter({level:1,ruleset:'dnd5e-2014'});
  const f={...custom([bonus('hp',5)]),effectMode:'manual',level:20,sourceRuleset:c.ruleset,catalogEntry:{ruleset:c.ruleset,kind:'feat',payload:{先决条件:'力量20'}}};
  assert.ok(featureActivation(f,c).active);c.featureEntries=[f];assert.equal(characterEffects(c).hpBonus,5);
  f.effectMode='off';assert.equal(characterEffects(c).hpBonus,0);
  f.effectMode='manual';f.catalogEntry.ruleset='dnd5r-2024';assert.equal(characterEffects(c).hpBonus,0);
});
test('bounded data normalization rejects unknown targets and expressions; persists without scripts',()=>{
  assert.deepEqual(normalizeFillEffects([{type:'bonus',target:'__proto__',value:5},{type:'eval',target:'hp'}]),[]);
  assert.equal(normalizeFillEffects([bonus('hp','2 * level')])[0].value,0);
  assert.equal(normalizeFillEffects([bonus('hp',Infinity)])[0].value,0);
  assert.equal(normalizeFillEffects(Array.from({length:40},()=>bonus('hp',1))).length,32);
  const c=createCharacter({featureEntries:[{...custom([bonus('hp',2,'level')]),effectMode:'manual'}]});
  const normalized=normalizeCharacter(c);
  assert.deepEqual(normalized.featureEntries[0].fillEffects,normalizeFillEffects(c.featureEntries[0].fillEffects));
  assert.equal(normalized.featureEntries[0].effectMode,'manual');
  assert.deepEqual(importDocument(JSON.parse(JSON.stringify(exportDocument(c)))).featureEntries[0].fillEffects,normalized.featureEntries[0].fillEffects);
  assert.equal(featureFillEffects({kind:'feat',name:'健壮'},'unknown').length,0);
});
test('effect editor exposes labels, ordinary controls, and escaped content',()=>{
  const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const html=renderFillEffectEditor({...custom([bonus('hp',2,'level')]),name:'<script>'},'dnd5e-2014',escape,true);
  assert.match(html,/效果加值/);assert.match(html,/玩家确认应用/);assert.match(html,/恢复预设/);assert.ok(!html.includes('<script>'));assert.match(html,/自动填卡效果/);
});
test('generic weapon bonuses use existing auto calculator and preserve authored attack formulas',()=>{
  const c=createCharacter({classId:'fighter'}),w={weaponType:'长剑',damageDie:'1d8'};
  const base=weaponCalculation(c,w);
  c.featureEntries=[custom([bonus('weaponAttack',2),bonus('weaponDamage',3)])];
  const result=weaponCalculation(c,w);
  assert.equal(result.attackBonus,base.attackBonus+2);assert.equal(result.damageBonus,base.damageBonus+3);
  assert.equal(weaponCalculation(c,{...w,attackMode:'manual',attackDie:'d20+99'}).attackDie,'d20+99');
});
test('5R Speedy template comes from local source and is not injected into 5E',()=>{
  const c=createCharacter({ruleset:'dnd5r-2024'});
  c.featureEntries=[{kind:'feat',name:'飙速跑者'}];
  assert.equal(deriveMvpCharacter(c).speed,40);
  c.ruleset='dnd5e-2014';assert.equal(deriveMvpCharacter(c).speed,30);
});
