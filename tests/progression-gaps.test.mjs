import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter,normalizeCharacter,deriveMvpCharacter,exportDocument,importDocument } from '../prototype/model.mjs';
import { hitDiceState,syncHitDice,setHitDiceAllocation,hitDiceRecovery,planHitDiceRecovery } from '../prototype/hit-dice.mjs';
import { completeRest,spendHitDie } from '../prototype/automation.mjs';
import { skillGrantState,normalizeSkillChoices,parseBackgroundSkills } from '../prototype/skill-grants.mjs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { characterEffects } from '../prototype/effects.mjs';

const mixed=overrides=>createCharacter({ruleset:'dnd5e-2014',classId:'fighter',level:3,multiclasses:[{classId:'wizard',level:2}],currentHp:2,hitDiceCurrent:2,...overrides});
const key=(c,type,id,suffix)=>`${c.ruleset}:${type}:${id}:${suffix}`;
test('legacy multiclass totals remain unresolved until exact distribution is supplied',()=>{
  const c=mixed(),before=JSON.stringify(c);
  assert.equal(hitDiceState(c).pending,true);
  assert.throws(()=>spendHitDie(c,'wizard',5,40),/分配/);assert.equal(JSON.stringify(c),before);
  assert.throws(()=>setHitDiceAllocation(c,{fighter:2,wizard:1}),/合计/);assert.equal(JSON.stringify(c),before);
  setHitDiceAllocation(c,{fighter:1,wizard:1});assert.equal(hitDiceState(c).pending,false);
  assert.deepEqual(c.hitDiceSpent,{fighter:2,wizard:1});assert.equal(c.hitDiceCurrent,2);
});
test('empty/full and single-class legacy totals have unambiguous migration',()=>{
  for(const current of [0,5]) {const c=mixed({hitDiceCurrent:current});syncHitDice(c);assert.equal(hitDiceState(c).pending,false);assert.equal(c.hitDiceCurrent,current);}
  const c=createCharacter({classId:'fighter',level:5,hitDiceCurrent:2});syncHitDice(c);assert.equal(c.hitDiceSpent.fighter,3);
});
test('multiclass healing spends the selected die and uses its actual face range',()=>{
  const c=mixed({abilities:{con:14}});setHitDiceAllocation(c,{fighter:1,wizard:1});
  assert.throws(()=>spendHitDie(c,'wizard',7,40),/1–6/);assert.equal(c.currentHp,2);
  spendHitDie(c,'wizard',6,40);assert.equal(c.currentHp,10);assert.equal(c.hitDiceSpent.wizard,2);assert.equal(c.hitDiceSpent.fighter,2);
  assert.throws(()=>spendHitDie(c,'wizard',1,40),/没有/);assert.equal(c.hitDiceCurrent,1);
});
test('negative Constitution never deals damage and overhealing never lowers existing HP',()=>{
  const c=createCharacter({classId:'wizard',level:2,hitDiceCurrent:2,currentHp:50,abilities:{con:3}});
  spendHitDie(c,'wizard',1,20);assert.equal(c.currentHp,50);assert.equal(c.hitDiceCurrent,1);
});
test('2014 recovery allocation is validated atomically before other resources',()=>{
  const c=mixed({hitDiceCurrent:0});syncHitDice(c);c.resourceSpent={actionSurge:1};
  const before=JSON.stringify(c);assert.equal(hitDiceRecovery(c).needsChoice,true);
  assert.throws(()=>completeRest(c,'long',40),/选择/);assert.equal(JSON.stringify(c),before);
  assert.throws(()=>completeRest(c,'long',40,{hitDiceRecovery:{fighter:2,wizard:2}}),/合计/);assert.equal(JSON.stringify(c),before);
  completeRest(c,'long',40,{hitDiceRecovery:{fighter:0,wizard:2}});
  assert.deepEqual(c.hitDiceSpent,{fighter:3,wizard:0});assert.equal(c.hitDiceCurrent,2);assert.equal(c.currentHp,40);assert.equal(c.resourceSpent.actionSurge,0);
});
test('2014 unambiguous recovery chooses no arbitrary class and 2024 recovers all',()=>{
  const c=mixed({hitDiceCurrent:0});syncHitDice(c);c.hitDiceSpent={fighter:2,wizard:0};
  assert.equal(hitDiceRecovery(c).needsChoice,false);completeRest(c,'long',40);assert.equal(c.hitDiceCurrent,5);
  c.hitDiceSpent={fighter:3,wizard:2};c.ruleset='dnd5r-2024';completeRest(c,'long',40);assert.equal(c.hitDiceCurrent,5);
});
test('2024 long rest can resolve a partial legacy total without guessing past expenditure',()=>{
  const c=mixed({ruleset:'dnd5r-2024'});assert.equal(hitDiceState(c).pending,true);
  completeRest(c,'long',40);assert.deepEqual(c.hitDiceSpent,{fighter:0,wizard:0});
});
test('level changes, temporary class removal and export preserve spent dice',()=>{
  const c=mixed({hitDiceCurrent:0});syncHitDice(c);c.level=4;syncHitDice(c);assert.equal(c.hitDiceCurrent,1);
  c.level=1;syncHitDice(c);c.level=4;syncHitDice(c);assert.equal(c.hitDiceCurrent,1);
  c.multiclasses=[];syncHitDice(c);assert.equal(c.hitDiceSpent.wizard,2);
  c.multiclasses=[{classId:'wizard',level:2}];const saved=importDocument(exportDocument(c));assert.equal(hitDiceState(saved).current,1);
});
test('short rest never refills Hit Dice; invalid levels stop long rest',()=>{
  const c=mixed({hitDiceCurrent:0});syncHitDice(c);completeRest(c,'short',40);assert.equal(c.hitDiceCurrent,0);
  c.level=20;assert.throws(()=>planHitDiceRecovery(c),/职业等级/);
});
test('initial class skills and multiclass grants have distinct limits',()=>{
  const c=createCharacter({classId:'rogue',level:1,multiclasses:[{classId:'bard',level:1},{classId:'wizard',level:1}]});
  const state=skillGrantState(c);assert.equal(state.groups.find(g=>g.id.includes('rogue:initial')).count,4);
  assert.equal(state.groups.find(g=>g.id.includes('bard:multiclass')).count,1);
  assert.equal(state.groups.some(g=>g.id.includes('wizard:multiclass')),false);
});
test('skill choices compute immediately without writing manual ranks',()=>{
  const c=createCharacter({classId:'fighter',level:5,skills:{arcana:2}}),id=key(c,'class','fighter','initial');
  c.skillChoices={[id]:['athletics','perception']};const d=deriveMvpCharacter(c);
  assert.equal(c.skills.athletics,0);assert.equal(d.skills.athletics,d.abilityModifiers.str+3);assert.equal(c.skills.arcana,2);
  c.skillChoices[id]=['','perception'];assert.equal(deriveMvpCharacter(c).skills.athletics,d.abilityModifiers.str);
});
test('duplicate and out-of-pool choices cannot create proficiency',()=>{
  const c=createCharacter({classId:'fighter'}),id=key(c,'class','fighter','initial');
  c.skillChoices={[id]:['athletics','athletics','arcana']};const state=skillGrantState(c);
  assert.equal(state.groups[0].valid.length,1);assert.equal(state.ranks.arcana,0);assert.ok(state.issues.some(i=>i.includes('重复')));
});
test('class and ruleset changes deactivate only their own grants and keep choices for return',()=>{
  const c=createCharacter({classId:'fighter',skills:{stealth:1}}),id=key(c,'class','fighter','initial');c.skillChoices={[id]:['athletics','perception']};
  c.classId='wizard';assert.equal(skillGrantState(c).ranks.athletics,0);assert.equal(skillGrantState(c).ranks.stealth,1);
  c.classId='fighter';c.ruleset='dnd5e-2014';assert.equal(skillGrantState(c).ranks.athletics,0);
  c.ruleset='dnd5r-2024';assert.equal(skillGrantState(c).ranks.athletics,1);
  const saved=normalizeCharacter(c);assert.deepEqual(saved.skillChoices[id],['athletics','perception']);
});
test('background choice source fingerprints prevent stale grants after name or text change',()=>{
  const c=createCharacter({background:'自定义背景',backgroundSkillProficiencies:'任选两项技能'});
  const group=skillGrantState(c).groups.find(g=>g.id.includes(':background:'));assert.equal(group.count,2);
  c.skillChoices={[group.id]:['arcana','history']};assert.equal(characterEffects(c).skillGrants.ranks.arcana,1);
  c.background='新背景';assert.equal(characterEffects(c).skillGrants.ranks.arcana,0);
  c.background='自定义背景';c.backgroundSkillProficiencies='从奥秘、宗教中选择一项';assert.equal(characterEffects(c).skillGrants.ranks.arcana,0);
  const replacement=skillGrantState(c).groups.find(g=>g.id.includes(':background:'));assert.deepEqual(replacement.options,['arcana','religion']);
});
test('complex background selections are not guessed and fixed proficiency cannot stack',()=>{
  const c=createCharacter({classId:'fighter',backgroundSkillProficiencies:'运动以及任选两项技能'});
  assert.ok(skillGrantState(c).groups[0].review);
  c.backgroundSkillProficiencies='运动';c.skillChoices={[key(c,'class','fighter','initial')]:['athletics','perception']};
  const state=characterEffects(c).skillGrants;assert.equal(state.ranks.athletics,1);assert.ok(state.issues.some(i=>i.includes('其他来源')));
});
test('expertise requires existing proficiency and revokes when its prerequisite disappears',()=>{
  const c=createCharacter({classId:'rogue'}),skills=key(c,'class','rogue','initial'),expertise=key(c,'expertise','rogue',1);
  c.skillChoices={[skills]:['stealth','perception','acrobatics','deception'],[expertise]:['stealth','arcana']};
  let state=skillGrantState(c);assert.equal(state.ranks.stealth,2);assert.equal(state.ranks.arcana,0);
  c.skillChoices[skills][0]='';state=skillGrantState(c);assert.equal(state.ranks.stealth,0);assert.ok(state.issues.some(i=>i.includes('先获得')));
});
test('2014 Rogue tool expertise is allowed, 2024 is skills only; bard levels differ',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'rogue'});c.skillChoices={[key(c,'expertise','rogue',1)]:['tool:thieves']};
  assert.equal(skillGrantState(c).toolExpertise,true);
  c.ruleset='dnd5r-2024';c.skillChoices={[key(c,'expertise','rogue',1)]:['tool:thieves']};assert.equal(skillGrantState(c).toolExpertise,false);
  c.classId='bard';c.level=2;assert.ok(skillGrantState(c).groups.some(g=>g.kind==='expertise'));
  c.ruleset='dnd5e-2014';assert.equal(skillGrantState(c).groups.some(g=>g.kind==='expertise'),false);
});
test('skill normalization discards hostile keys and oversized values',()=>{
  assert.deepEqual(normalizeSkillChoices(JSON.parse('{"__proto__":["arcana"],"invalid":["stealth"]}')),{});
  const c=createCharacter({classId:'fighter'}),id=key(c,'class','fighter','initial');
  assert.deepEqual(normalizeSkillChoices({[id]:['bad','athletics']}),{[id]:['','athletics']});
});
test('fixed-plus-choice skill phrases preserve the fixed grant and restrict only the choice',()=>{
  for(const text of ['历史，从奥秘，自然和宗教中选择一个','历史，外加从奥秘、自然、宗教之中你选择的一项']) {
    const parsed=parseBackgroundSkills(text);assert.deepEqual(parsed.fixed,['history']);assert.equal(parsed.choice.count,1);assert.deepEqual(parsed.choice.options,['arcana','nature','religion']);
    const c=createCharacter({backgroundSkillProficiencies:text});assert.equal(characterEffects(c).skillGrants.ranks.history,1);
  }
  const conditional=parseBackgroundSkills('游说，从奥秘，历史和宗教中适合你教团的技能选择一个');assert.deepEqual(conditional.fixed,['persuasion']);assert.ok(conditional.choice.review);
});
test('actual imported background choice records from both editions retain fixed proficiency',()=>{
  const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
  for(const [ruleset,name] of [['dnd5e-2014','隐修学者CloisteredScholar'],['dnd5r-2024','与世隔绝的学者']]) {
    const row=db.prepare('SELECT payload_json FROM library_entries WHERE ruleset=? AND kind=? AND name=?').get(ruleset,'background',name);
    assert.ok(row);const payload=JSON.parse(row.payload_json),c=createCharacter({ruleset,background:name,backgroundSource:{name,ruleset,payload}});
    let effects=characterEffects(c),group=effects.skillGrants.groups.find(g=>g.kind==='skill'&&g.fixed);
    assert.equal(group.count,1);assert.equal(effects.skillGrants.ranks.history,1);
    c.skillChoices={[group.id]:['arcana']};effects=characterEffects(c);assert.equal(effects.skillGrants.ranks.history,1);assert.equal(effects.skillGrants.ranks.arcana,1);
  }
  db.close();
});
