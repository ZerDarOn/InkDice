import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createCharacter,normalizeCharacter,deriveMvpCharacter } from '../prototype/model.mjs';
import { characterEffects } from '../prototype/effects.mjs';
import { advancementSlots,featAbilitySpec,featChoiceKey,normalizeFeatChoices } from '../prototype/advancement.mjs';
import { entryEligibility } from '../prototype/character-rules.mjs';
const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
function feat(c,name,id='feat1') {
  const entry=db.prepare('SELECT * FROM library_entries WHERE ruleset=? AND kind=? AND name=?').get(c.ruleset,'feat',name);
  assert.ok(entry,name);entry.payload=JSON.parse(entry.payload_json);
  const f={id,kind:'feat',name,level:0,catalogEntry:entry,sourceRuleset:c.ruleset};c.featureEntries.push(f);return f;
}
const pick=(c,f,...ids)=>{c.featAbilityChoices[featChoiceKey(f,c)]=ids;};
test('advancement slots are per-class with Fighter and Rogue exceptions, not total-level ASIs',()=>{
  const c=createCharacter({classId:'fighter',level:6,multiclasses:[{classId:'rogue',level:10}]});
  assert.deepEqual(advancementSlots(c).map(s=>[s.classId,s.level]),[['fighter',4],['fighter',6],['rogue',4],['rogue',8],['rogue',10]]);
  c.level=3;c.multiclasses[0].level=3;assert.equal(advancementSlots(c).length,0);
});
test('edition-specific source keys and level-19 reward labels stay separate',()=>{
  const c=createCharacter({classId:'wizard',level:19});assert.match(advancementSlots(c).at(-1).name,/传奇恩惠/);
  c.ruleset='dnd5e-2014';assert.doesNotMatch(advancementSlots(c).at(-1).name,/传奇恩惠/);
  c.multiclasses=[{classId:'wizard',level:1}];assert.deepEqual(advancementSlots(c),[]);
});
test('actual imported ASIs support +2 or split +1 and never rewrite base ability scores',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const c=createCharacter({ruleset,classId:'fighter',level:4,abilities:{str:15,con:13}}),f=feat(c,'属性值提升');
    pick(c,f,'str','str');assert.equal(characterEffects(c).abilities.str,17);assert.equal(c.abilities.str,15);
    pick(c,f,'str','con');assert.equal(characterEffects(c).abilities.str,16);assert.equal(characterEffects(c).abilities.con,14);
    pick(c,f,'str');assert.equal(characterEffects(c).abilities.str,15);
  }
});
test('ordinary cap20 does not lower an existing above-cap value',()=>{
  const c=createCharacter({level:4,abilities:{str:19,con:23}}),f=feat(c,'属性值提升');
  pick(c,f,'str','str');assert.equal(characterEffects(c).abilities.str,20);
  pick(c,f,'con','con');assert.equal(characterEffects(c).abilities.con,23);assert.match(characterEffects(c).advancement.rows[0].error,/上限/);
});
test('same-name feats use actual version text: GWM boosts Strength only in 2024',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const c=createCharacter({ruleset,level:4,abilities:{str:14}}),f=feat(c,'巨武器大师');pick(c,f,'str');
    assert.equal(characterEffects(c).abilities.str,ruleset==='dnd5r-2024'?15:14);
    assert.equal(Boolean(featAbilitySpec(f)),ruleset==='dnd5r-2024');
  }
});
test('half-feat choices are constrained by text and cannot satisfy their own prerequisites',()=>{
  const c=createCharacter({level:4,abilities:{cha:12}}),f=feat(c,'演员');pick(c,f,'cha');
  assert.equal(characterEffects(c).abilities.cha,12);
  c.abilities.cha=13;assert.equal(characterEffects(c).abilities.cha,14);
  pick(c,f,'str');assert.equal(characterEffects(c).abilities.str,c.abilities.str);
});
test('missing choices never double-apply to migrated final scores',()=>{
  const c=createCharacter({level:4,abilities:{cha:18}});feat(c,'演员');
  assert.equal(characterEffects(c).abilities.cha,18);assert.match(characterEffects(c).advancement.rows[0].error,/请选择/);
});
test('slot conflicts deactivate all occupants, including Tough HP; stopping one resolves it',()=>{
  const c=createCharacter({classId:'fighter',level:4}),a=feat(c,'属性值提升'),b=feat(c,'健壮','b');
  a.advancementSource=b.advancementSource=advancementSlots(c)[0].id;pick(c,a,'con','con');
  assert.equal(characterEffects(c).hpBonus,0);assert.equal(characterEffects(c).abilities.con,13);
  b.effectMode='off';assert.equal(characterEffects(c).abilities.con,15);
});
test('level reduction or removed multiclass deactivates owned feats and restores on return',()=>{
  const c=createCharacter({classId:'fighter',level:3,multiclasses:[{classId:'rogue',level:4}]}),f=feat(c,'健壮');
  f.advancementSource=advancementSlots(c)[0].id;assert.equal(characterEffects(c).hpBonus,14);
  c.multiclasses=[];assert.equal(characterEffects(c).hpBonus,0);
  c.multiclasses=[{classId:'rogue',level:4}];assert.equal(characterEffects(c).hpBonus,14);
});
test('cross-edition grants and choices never leak; returning restores unchanged choices',()=>{
  const c=createCharacter({classId:'fighter',level:4}),f=feat(c,'属性值提升');pick(c,f,'con','con');
  assert.equal(characterEffects(c).abilities.con,15);
  c.ruleset='dnd5e-2014';assert.equal(characterEffects(c).abilities.con,13);
  c.ruleset='dnd5r-2024';assert.equal(characterEffects(c).abilities.con,15);
});
test('changing catalog identity or custom text invalidates old ability choices',()=>{
  const c=createCharacter({level:4}),f=feat(c,'属性值提升');pick(c,f,'con','con');
  f.catalogEntry={...f.catalogEntry,id:'different'};assert.equal(characterEffects(c).abilities.con,13);
});
test('repeated ASIs stack within cap but nonrepeatable identical feats do not stack',()=>{
  const c=createCharacter({classId:'fighter',level:8}),a=feat(c,'属性值提升'),b=feat(c,'属性值提升','b');
  pick(c,a,'con','con');pick(c,b,'con','con');assert.equal(characterEffects(c).abilities.con,17);
  c.featureEntries=[];const x=feat(c,'演员'),y=feat(c,'演员','y');pick(c,x,'cha');pick(c,y,'cha');
  assert.equal(characterEffects(c).abilities.cha,16);assert.match(characterEffects(c).activations[1].reason,/重复/);
});
test('ability changes propagate to HP, saves, DC and attack, with reversibility',()=>{
  const c=createCharacter({classId:'wizard',level:4,abilities:{con:13,int:15}}),before=deriveMvpCharacter(c),f=feat(c,'属性值提升');
  pick(c,f,'con','int');const after=deriveMvpCharacter(c);
  assert.equal(after.hitPoints,before.hitPoints+4);assert.equal(after.spellcasting.saveDc,before.spellcasting.saveDc+1);
  assert.equal(after.spellcasting.attackBonus,before.spellcasting.attackBonus+1);assert.equal(after.savingThrows.con,before.savingThrows.con+1);
  f.effectMode='off';assert.equal(deriveMvpCharacter(c).hitPoints,before.hitPoints);
});
test('normalization preserves source metadata and selections but drops invalid keys',()=>{
  const c=createCharacter({classId:'fighter',level:4}),f=feat(c,'属性值提升');f.advancementSource=advancementSlots(c)[0].id;f.sourceNote='团规';pick(c,f,'str','str');
  const restored=normalizeCharacter(JSON.parse(JSON.stringify(c)));assert.equal(characterEffects(restored).abilities.str,10);assert.equal(restored.featureEntries[0].sourceNote,'团规');
  assert.deepEqual(normalizeFeatChoices(JSON.parse('{"__proto__":["str"],"bad":["dex"]}')),{});
});
test('parser rejects conditional/stat-check bonuses and custom score caps without explicit wording',()=>{
  for(const description of ['当你狂暴时，你的力量增加1，上限为20。','你的魅力检定增加1，上限为20。','你的魅力提升1，最高30，但只有夜晚有效。','选择你不具有豁免熟练的属性，该属性提升1，至多提升至20。']) assert.equal(featAbilitySpec({kind:'feat',name:'test',description}),null);
  const spec=featAbilitySpec({kind:'feat',description:'属性值提升Ability Score Increase。你选择的一项属性提升1，至多提升至30。'});assert.equal(spec.cap,30);assert.equal(spec.options.length,6);
});
test('eligibility itself rejects cross-edition catalog and handles 或者 race wording',()=>{
  const c=createCharacter({level:4,species:'精灵'}),f=feat(c,'精灵之准');
  assert.equal(entryEligibility(f.catalogEntry,c).status,'eligible');
  c.ruleset='dnd5e-2014';assert.equal(entryEligibility(f.catalogEntry,c).status,'blocked');
});
test.after(()=>db.close());
