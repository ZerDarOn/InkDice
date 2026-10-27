import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter, normalizeWeapon, normalizeCharacter, exportDocument, importDocument, getAttunedEquipment} from '../prototype/model.mjs';

test('new cards start with two blank weapon rows in both editions', () => {
  for (const ruleset of ['dnd5e-2014', 'dnd5r-2024']) {
    const c = createCharacter({ruleset});
    assert.equal(c.weapons.length, 2);
    assert.ok(c.weapons.every(w => !w.name && !w.weaponType && !w.damageDie && !w.attackDie));
  }
});
test('weapon row additions and deletions survive save/export, including zero rows', () => {
  const c = createCharacter();
  c.weapons.push(normalizeWeapon({name:'第三件',attuned:true}));
  assert.equal(importDocument(exportDocument(c)).weapons.length, 3);
  c.weapons.splice(0, 2);
  const restored = importDocument(exportDocument(c));
  assert.equal(restored.weapons.length, 1);
  assert.equal(restored.weapons[0].name, '第三件');
  assert.equal(getAttunedEquipment(restored).length, 1);
  restored.weapons.splice(0, 1);
  assert.equal(importDocument(exportDocument(restored)).weapons.length, 0);
  assert.equal(getAttunedEquipment(restored).length, 0);
});
test('existing five-row and longer weapon lists preserve every record and manual value', () => {
  for (const count of [5, 8]) {
    const c = createCharacter({weapons:Array.from({length:count}, (_,i)=>({name:`武器${i}`,attackDie:'d20+9',effect:`效果${i}`,attuned:i===count-1}))});
    const restored = importDocument(exportDocument(c));
    assert.equal(restored.weapons.length, count);
    assert.equal(restored.weapons.at(-1).effect, `效果${count-1}`);
    assert.equal(restored.weapons.at(-1).attackDie, 'd20+9');
    assert.equal(getAttunedEquipment(restored).length, 1);
  }
});
test('legacy third hand and attack rows are not lost when default changes to two', () => {
  const c = normalizeCharacter({equipmentTwoHand:'旧双手剑',equipmentTwoHandAttuned:true});
  assert.equal(c.weapons.length, 3);
  assert.equal(c.weapons[2].name, '旧双手剑');
  assert.equal(c.weapons[2].attuned, true);
  const attacks = Array.from({length:6}, (_,i)=>({name:`旧攻击${i}`,attackBonus:2,damage:'1d6'}));
  assert.equal(normalizeCharacter({attacks}).weapons[5].damageDie, '1d6');
});
