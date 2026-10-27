import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createCharacter,normalizeCharacter,deriveMvpCharacter } from '../prototype/model.mjs';
import { characterEffects,effectiveProficiencies } from '../prototype/effects.mjs';
import { featChoiceKey } from '../prototype/advancement.mjs';
import { proficiencyGrantState,INSTRUMENTS } from '../prototype/proficiency-grants.mjs';
const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
const editions=['dnd5e-2014','dnd5r-2024'];
function feat(c,name,id=name) {
  const entry=db.prepare('SELECT * FROM library_entries WHERE ruleset=? AND kind=? AND name=?').get(c.ruleset,'feat',name);
  assert.ok(entry,name);entry.payload=JSON.parse(entry.payload_json);
  const f={id,kind:'feat',name,catalogEntry:entry,sourceRuleset:c.ruleset};c.featureEntries.push(f);return f;
}
test('Resilient: actual workbook text grants chosen +1 and save in both editions',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'wizard',level:4,abilities:{con:13}}),f=feat(c,'强健身心');
    c.featAbilityChoices[featChoiceKey(f,c)]=['con'];let d=deriveMvpCharacter(c);
    assert.equal(d.effects.abilities.con,14);assert.equal(d.savingThrows.con,4);
    f.effectMode='off';d=deriveMvpCharacter(c);assert.equal(d.effects.abilities.con,13);assert.equal(d.savingThrows.con,1);
  }
});
test('2024 Resilient disallows an existing save; 2014 allows its ability increase without double proficiency',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'wizard',level:4,abilities:{int:13}}),f=feat(c,'强健身心');
    c.featAbilityChoices[featChoiceKey(f,c)]=['int'];const d=deriveMvpCharacter(c);
    assert.equal(d.effects.abilities.int,ruleset==='dnd5r-2024'?13:14);assert.equal(d.savingThrows.int,ruleset==='dnd5r-2024'?3:4);
  }
});
test('class saves trigger at own class levels, include edition-specific Rogue saves and Monk death saves',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'wizard',level:1,multiclasses:[{classId:'rogue',level:15}]});
    let d=deriveMvpCharacter(c);assert.ok(d.effects.advancement.savingThrows.includes('wis'));
    assert.equal(d.effects.advancement.savingThrows.includes('cha'),ruleset==='dnd5r-2024');
    c.multiclasses=[{classId:'monk',level:14}];d=deriveMvpCharacter(c);assert.equal(d.effects.advancement.savingThrows.length,6);assert.equal(d.deathSaveBonus,5);
    c.multiclasses[0].level=13;d=deriveMvpCharacter(c);assert.equal(d.effects.advancement.savingThrows.length,2);assert.equal(d.deathSaveBonus,0);
  }
});
test('known early Resilient remains legal after later single-class all-save feature',()=>{
  const c=createCharacter({classId:'monk',level:14,abilities:{con:13}}),f=feat(c,'强健身心');
  f.advancementSource='dnd5r-2024:monk:4';c.featAbilityChoices[featChoiceKey(f,c)]=['con'];
  assert.equal(characterEffects(c).abilities.con,14);
  f.advancementSource='';assert.equal(characterEffects(c).abilities.con,13);
});
test('Skilled mixes exactly three skills and tools, revokes cleanly and survives normalization',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'fighter',level:4}),f=feat(c,'熟习');
    let s=characterEffects(c).skillGrants,g=s.groups.find(x=>x.kind==='mixed');assert.ok(g);
    c.skillChoices[g.id]=['arcana','tool:炼金工具','tool:鼓'];s=characterEffects(normalizeCharacter(c)).skillGrants;
    assert.equal(s.ranks.arcana,1);assert.deepEqual(s.tools,['炼金工具','鼓']);assert.match(effectiveProficiencies(c).tools,/炼金工具/);
    c.skillChoices[g.id].push('history');assert.equal(characterEffects(c).skillGrants.ranks.history,0);
    f.effectMode='off';assert.equal(characterEffects(c).skillGrants.ranks.arcana,0);assert.equal(effectiveProficiencies(c).tools,'');
  }
});
test('Skilled cannot consume duplicated or already granted tools and skills',()=>{
  const c=createCharacter({classId:'rogue',level:4,skills:{arcana:1}});feat(c,'熟习');
  const g=characterEffects(c).skillGrants.groups.find(x=>x.kind==='mixed');c.skillChoices[g.id]=['arcana','tool:盗贼工具','tool:盗贼工具'];
  assert.equal(characterEffects(c).skillGrants.groups.find(x=>x.id===g.id).valid.length,0);
});
test('2024 Skilled repeats while 2014 does not; background Skilled supplies a separate three-pick source',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'fighter',level:4});feat(c,'熟习','a');feat(c,'熟习','b');
    assert.equal(characterEffects(c).skillGrants.groups.filter(x=>x.kind==='mixed').length,ruleset==='dnd5r-2024'?2:1);
  }
  const c=createCharacter({background:'测试背景',backgroundSource:{ruleset:'dnd5r-2024',name:'测试背景',payload:{专长:'熟习'}}});
  assert.equal(characterEffects(c).skillGrants.groups.find(x=>x.kind==='mixed').count,3);
  c.background='换背景';assert.ok(!characterEffects(c).skillGrants.groups.some(x=>x.kind==='mixed'));
});
test('Skill Expert new proficiency may be chosen for its expertise, and no expertise stacks',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'fighter',level:4}),f=feat(c,'技艺专家');
    let s=characterEffects(c).skillGrants,g=s.groups.find(x=>x.name==='技艺专家：技能熟练');assert.ok(g);
    c.skillChoices[g.id]=['arcana'];s=characterEffects(c).skillGrants;g=s.groups.find(x=>x.name==='技艺专家：技能专精');assert.ok(g.options.includes('arcana'));
    c.skillChoices[g.id]=['arcana'];assert.equal(characterEffects(c).skillGrants.ranks.arcana,2);
    c.featAbilityChoices[featChoiceKey(f,c)]=['int'];assert.equal(characterEffects(c).abilities.int,c.abilities.int+1);
    f.effectMode='off';assert.equal(characterEffects(c).skillGrants.ranks.arcana,0);
  }
});
test('Poisoner tool grant and Linguist languages/Intelligence use active source only',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'fighter',level:4}),f=feat(c,'毒师');assert.match(effectiveProficiencies(c).tools,/制毒工具/);
    f.sourceRuleset=ruleset===editions[0]?editions[1]:editions[0];assert.equal(effectiveProficiencies(c).tools,'');
  }
  const c=createCharacter({ruleset:editions[0],classId:'fighter',level:4}),f=feat(c,'语言学家');
  c.featAbilityChoices[featChoiceKey(f,c)]=['int'];assert.equal(characterEffects(c).abilities.int,c.abilities.int+1);
  const g=effectiveProficiencies(c).grants.groups.find(x=>x.name==='语言学家');c.proficiencyChoices[g.id]=['龙语','精灵语','矮人语'];
  assert.equal(effectiveProficiencies(normalizeCharacter(c)).languages,'龙语、精灵语、矮人语');
});
test('initial and multiclass tool sources have exact independent budgets and revoke on class removal',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'bard',level:1,multiclasses:[{classId:'monk',level:1},{classId:'rogue',level:1}]});
    let s=proficiencyGrantState(c),g=s.groups.find(x=>x.kind==='tool');assert.equal(g.count,3);assert.deepEqual(g.options,INSTRUMENTS);assert.ok(s.tools.includes('盗贼工具'));assert.equal(s.groups.filter(x=>x.kind==='tool').length,1);
    c.classId='fighter';c.multiclasses=[{classId:'bard',level:1}];s=proficiencyGrantState(c);assert.equal(s.groups.find(x=>x.kind==='tool').count,1);assert.ok(!s.tools.includes('盗贼工具'));
    c.classId='artificer';c.multiclasses=[];s=proficiencyGrantState(c);assert.deepEqual(s.tools,['盗贼工具','修补工具']);assert.equal(s.groups.find(x=>x.kind==='tool').count,1);
  }
});
test('secret class languages are not initial-tool grants; 2024 language tables are separate',()=>{
  for(const ruleset of editions) {
    const c=createCharacter({ruleset,classId:'fighter',level:1,multiclasses:[{classId:'druid',level:1},{classId:'rogue',level:1}]});
    let s=proficiencyGrantState(c);assert.ok(s.languages.includes('德鲁伊语'));assert.ok(s.languages.includes('盗贼黑话'));assert.ok(!s.tools.includes('草药工具'));
    assert.equal(s.groups.some(x=>x.id.includes('creation:')),ruleset==='dnd5r-2024');
    if(ruleset==='dnd5r-2024') {
      const base=s.groups.find(x=>x.id.includes('creation:')),rogue=s.groups.find(x=>x.id.includes('class:rogue:cant'));
      assert.equal(base.count,2);assert.ok(!base.options.includes('深渊语'));assert.ok(base.options.includes('通用手语'));assert.ok(rogue.options.includes('德鲁伊语'));
      c.proficiencyChoices[base.id]=['深渊语','通用手语'];assert.equal(proficiencyGrantState(c).groups.find(x=>x.id===base.id).valid.length,1);
    }
    c.multiclasses=[];s=proficiencyGrantState(c);assert.ok(!s.languages.includes('德鲁伊语'));assert.ok(!s.languages.includes('盗贼黑话'));
  }
});
test('Ranger2 languages and stale background do not prevent independent class grants',()=>{
  const c=createCharacter({classId:'ranger',level:2,background:'new',backgroundSource:{ruleset:'dnd5e-2014',name:'old',payload:{}},backgroundLanguages:'矮人语'});
  let s=proficiencyGrantState(c);assert.ok(s.groups.some(g=>g.name==='游侠2级语言'));assert.ok(!s.languages.includes('矮人语'));
  c.level=1;assert.ok(!proficiencyGrantState(c).groups.some(g=>g.name==='游侠2级语言'));
});
