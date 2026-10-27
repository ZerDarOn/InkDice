import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createCharacter,normalizeCharacter } from '../prototype/model.mjs';
import { effectiveProficiencies } from '../prototype/effects.mjs';
import { parseProficiencyGrant,proficiencyGrantState,normalizeProficiencyChoices,ARTISAN_TOOLS,INSTRUMENTS } from '../prototype/proficiency-grants.mjs';
test('fixed tool grants split cleanly and choices are never treated as actual tool names',()=>{
  const c=createCharacter({backgroundToolProficiencies:'易容工具，一种乐器'});
  let state=proficiencyGrantState(c);assert.deepEqual(state.tools,['易容工具']);assert.deepEqual(state.groups[0].options,INSTRUMENTS);
  c.proficiencyChoices[state.groups[0].id]=['鲁特琴'];assert.equal(effectiveProficiencies(c).tools,'易容工具、鲁特琴');
});
test('artisan pool, disjunctions and fixed-plus-choice preserve their counts',()=>{
  const p=parseProficiencyGrant('三种工匠工具','tool');assert.equal(p.groups[0].count,3);assert.deepEqual(p.groups[0].options,ARTISAN_TOOLS);
  const p2=parseProficiencyGrant('厨师工具，和另外一种你自选的工匠工具。','tool');assert.deepEqual(p2.fixed,['厨师工具']);assert.equal(p2.groups[0].count,1);
  const p3=parseProficiencyGrant('一种赌具或一种乐器','tool');assert.equal(p3.groups[0].count,1);assert.ok(p3.groups[0].options.includes('纸牌'));assert.ok(p3.groups[0].options.includes('鼓'));
});
test('finite named tool and language pools do not broaden into arbitrary choices',()=>{
  const p=parseProficiencyGrant('书法工具或炼金工具','tool');assert.deepEqual(p.groups[0].options,['书法工具','炼金工具']);
  const p2=parseProficiencyGrant('在龙语，地精语和维多肯语中任选一种','language');assert.deepEqual(p2.groups[0].options,['龙语','地精语','维多肯语']);
  const c=createCharacter({backgroundLanguages:'从龙语，地精语中选择一个'}),g=proficiencyGrantState(c).groups[0];c.proficiencyChoices[g.id]=['天界语'];
  assert.deepEqual(proficiencyGrantState(c).languages,['通用语']);
});
test('complex conditional grants stay visible for review and grant nothing automatically',()=>{
  for(const text of ['一种工匠工具（你可以用领航工具的熟练项替换）','两种，视家族决定：炼金工具和修补工具','从一种赌具、一种乐器和盗贼工具中选择两项']) {
    const p=parseProficiencyGrant(text,'tool');assert.ok(p.review);assert.deepEqual(p.fixed,[]);assert.deepEqual(p.groups,[]);
  }
  assert.ok(parseProficiencyGrant('选择两门语言，其中一门必须为深渊语','language').review);
});
test('custom language selection is allowed but secret languages do not bypass requirements',()=>{
  const c=createCharacter({backgroundLanguages:'自选两门语言'}),g=proficiencyGrantState(c).groups[0];
  c.proficiencyChoices[g.id]=['本团月语','盗贼黑话'];assert.deepEqual(proficiencyGrantState(c).languages,['通用语','本团月语']);assert.ok(proficiencyGrantState(c).issues.some(s=>s.includes('特定能力')));
});
test('fixed language plus another choice preserves the fixed grant',()=>{
  const p=parseProficiencyGrant('巨人语和另一门你自选的语言','language');assert.deepEqual(p.fixed,['巨人语']);assert.equal(p.groups[0].count,1);
});
test('duplicate and over-budget choices never stack and manual fields remain untouched',()=>{
  const c=createCharacter({knownLanguages:'龙语',backgroundLanguages:'你选择的两种语言'}),g=proficiencyGrantState(c).groups[0];
  c.proficiencyChoices[g.id]=['龙语','精灵语','地精语'];const state=proficiencyGrantState(c);
  assert.deepEqual(state.languages,['龙语','通用语','精灵语']);assert.equal(state.groups[0].valid.length,1);assert.equal(c.knownLanguages,'龙语');
});
test('background name or ruleset switches revoke grants while preserving manual sources',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',background:'水手',backgroundToolProficiencies:'领航工具，载具（水运）',toolProficiencies:'自制工具',backgroundSource:{ruleset:'dnd5e-2014',name:'水手',payload:{}}});
  assert.equal(proficiencyGrantState(c).tools.length,3);c.ruleset='dnd5r-2024';assert.deepEqual(proficiencyGrantState(c).tools,['自制工具']);
  c.ruleset='dnd5e-2014';c.background='艺人';assert.deepEqual(proficiencyGrantState(c).tools,['自制工具']);
  c.background='水手';assert.equal(proficiencyGrantState(c).tools.length,3);
});
test('choice fingerprint tracks background and ruleset and survives save normalization',()=>{
  const c=createCharacter({background:'自定义',backgroundToolProficiencies:'一种乐器'}),g=proficiencyGrantState(c).groups[0];c.proficiencyChoices[g.id]=['鼓'];
  assert.deepEqual(proficiencyGrantState(normalizeCharacter(c)).tools,['鼓']);
  c.ruleset='dnd5e-2014';assert.deepEqual(proficiencyGrantState(c).tools,[]);
  c.ruleset='dnd5r-2024';c.background='另一背景';assert.deepEqual(proficiencyGrantState(c).tools,[]);
});
test('imported same-theme backgrounds keep edition-specific tool and language grants',()=>{
  const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
  for(const [ruleset,name] of [['dnd5e-2014','侍僧Acolyte'],['dnd5r-2024','侍僧']]) {
    const row=db.prepare('SELECT payload_json FROM library_entries WHERE ruleset=? AND kind=? AND name=?').get(ruleset,'background',name);assert.ok(row);
    const c=createCharacter({ruleset,background:name,backgroundSource:{ruleset,name,payload:JSON.parse(row.payload_json)}}),s=proficiencyGrantState(c);
    if(ruleset==='dnd5e-2014'){assert.deepEqual(s.tools,[]);assert.equal(s.groups[0].count,2);}
    else {assert.deepEqual(s.tools,['书法工具']);assert.equal(s.groups.filter(g=>g.id.includes(':background:')).length,0);assert.ok(s.groups.some(g=>g.id.includes(':creation:')));}
  }
  db.close();
});
test('choice normalization limits fields and ignores prototype keys',()=>{
  assert.deepEqual(normalizeProficiencyChoices(JSON.parse('{"__proto__":["x"],"bad":[]}')),{});
  assert.equal(normalizeProficiencyChoices({'dnd5e-2014:test':['a'.repeat(100)]})['dnd5e-2014:test'][0].length,80);
});
