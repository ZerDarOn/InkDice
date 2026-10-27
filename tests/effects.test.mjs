import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, deriveMvpCharacter, normalizeCharacter, validateCharacter } from '../prototype/model.mjs';
import { characterEffects, backgroundSkillIds, effectiveProficiencies } from '../prototype/effects.mjs';

test('Tough follows total level, does not stack, and revokes on removal', () => {
  const c=createCharacter({level:5}); const base=deriveMvpCharacter(c).hitPoints;
  c.featureEntries=[{kind:'feat',name:'健壮'},{kind:'feat',name:'健壮'}];
  assert.equal(deriveMvpCharacter(c).hitPoints,base+10);
  c.multiclasses=[{classId:'fighter',level:2,subclass:''}];
  assert.equal(characterEffects(c).hpBonus,14);
  c.featureEntries=[]; assert.equal(characterEffects(c).hpBonus,0);
});
test('background skills are derived, not written over manually selected expertise', () => {
  const c=createCharacter({backgroundSkillProficiencies:'运动、威吓',skills:{athletics:2}});
  assert.ok(characterEffects(c).backgroundSkills.includes('athletics'));
  assert.equal(c.skills.athletics,2);
  assert.deepEqual(backgroundSkillIds('任选两种技能'),[]);
  c.backgroundSource={name:'旧背景',ruleset:c.ruleset,payload:{技能熟练:'运动'}};
  assert.deepEqual(characterEffects(c).backgroundSkills,[]);
});
test('2024 background ability allocation validates totals, caps at20, and does not mutate base', () => {
  const c=createCharacter({background:'士兵',abilities:{str:19,dex:12,con:13}});
  c.backgroundSource={name:'士兵',ruleset:c.ruleset,payload:{属性值:'力量、敏捷、体质',专长:'健壮'}};
  c.backgroundAbilityBonuses={str:2,con:1};
  assert.equal(characterEffects(c).abilities.str,20);
  assert.equal(c.abilities.str,19);
  assert.equal(characterEffects(c).hpBonus,c.level*2);
  c.backgroundAbilityBonuses={str:2,con:2};
  assert.equal(characterEffects(c).abilities.str,19);
  assert.ok(characterEffects(c).backgroundBonusWarning);
  c.ruleset='dnd5e-2014';assert.equal(characterEffects(c).hpBonus,0);
});
test('Defense is a fighting style, and applies only while armored', () => {
  const c=createCharacter({armorId:'unarmored'});
  c.featureEntries=[{kind:'fighting',name:'防御'}];
  assert.equal(characterEffects(c).defenseBonus,0);
  c.armorId='leather'; assert.equal(characterEffects(c).defenseBonus,1);
  c.featureEntries=[{kind:'feat',name:'防御'}];assert.equal(characterEffects(c).defenseBonus,0);
});
test('separate defensive fields and creature portrait survive normalization', () => {
  const c=normalizeCharacter({resistances:'火焰',immunities:'毒素',senses:'黑暗视觉60尺',deployedCreatures:[{portrait:'data:image/png;base64,AA==',name:'测试'}]});
  assert.equal(c.resistances,'火焰');assert.equal(c.immunities,'毒素');assert.equal(c.senses,'黑暗视觉60尺');
  assert.equal(c.deployedCreatures[0].portrait,'data:image/png;base64,AA==');
});
test('initial fighter grants weapon proficiencies without overwriting custom text', () => {
  const c=createCharacter({classId:'fighter',weaponProficiencies:'自定义武器'});
  assert.deepEqual(effectiveProficiencies(c).weapons,['自定义武器','简易武器','军用武器']);
});

test('multiclass validation uses the same effective background scores as the sheet',()=>{
  const c=createCharacter({classId:'fighter',level:3,background:'测试背景',abilities:{str:13,wis:12},multiclasses:[{classId:'cleric',level:1}]});
  c.backgroundSource={name:c.background,ruleset:c.ruleset,payload:{属性值:'力量、感知、体质'}};
  c.backgroundAbilityBonuses={wis:1,con:2};
  assert.ok(!validateCharacter(c).some(i=>i.message.includes('牧师兼职要求')));
  c.backgroundAbilityBonuses={};assert.ok(validateCharacter(c).some(i=>i.message.includes('牧师兼职要求')));
});
test('effects do not cross editions and stale backgrounds explain why they are inactive',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',background:'测试背景'});
  c.featureEntries=[{kind:'feat',name:'健壮',catalogEntry:{ruleset:'dnd5r-2024'}}];
  c.backgroundSource={name:c.background,ruleset:'dnd5r-2024',payload:{技能熟练:'运动',专长:'健壮'}};
  const effect=characterEffects(c);
  assert.equal(effect.hpBonus,0);assert.deepEqual(effect.backgroundSkills,[]);
  assert.match(effect.backgroundBonusWarning,/规则版本不一致/);
});
