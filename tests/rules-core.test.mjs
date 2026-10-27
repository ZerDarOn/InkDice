import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  abilityModifier,
  calculateArmorClass,
  calculateHitPoints,
  deriveCharacter,
  proficiencyBonus,
} from "../packages/rules-core/index.mjs";
import { rules5e2014 } from "../packages/rules-5e-2014/adapter.mjs";
import { rules5r2024 } from "../packages/rules-5r-2024/adapter.mjs";

const fixturePath = new URL("../examples/bard-5r.json", import.meta.url);
const bard5r = JSON.parse(await readFile(fixturePath, "utf8"));

test("ability modifiers follow the bounded d20 rule", () => {
  assert.equal(abilityModifier(8), -1);
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(18), 4);
  assert.throws(() => abilityModifier(31), RangeError);
});

test("proficiency bonus advances at levels 5, 9, 13, and 17", () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test("armor and fixed hit point calculations are explicit", () => {
  assert.equal(calculateArmorClass({ dexterityModifier: 3, armor: { category: "light", base: 12 } }), 15);
  assert.equal(calculateArmorClass({ dexterityModifier: 4, armor: { category: "medium", base: 14 }, shield: true }), 18);
  assert.equal(calculateHitPoints({ hitDie: 8, levels: 5, constitutionModifier: 2, fixedPerLevel: 5 }), 38);
});

test("5R bard vertical slice derives transparent combat values", () => {
  const result = deriveCharacter(bard5r, rules5r2024);
  assert.equal(result.level, 5);
  assert.equal(result.proficiencyBonus, 3);
  assert.equal(result.armorClass, 15);
  assert.equal(result.hitPoints, 38);
  assert.equal(result.initiative, 3);
  assert.equal(result.savingThrows.dex, 6);
  assert.equal(result.savingThrows.cha, 7);
  assert.equal(result.skills.performance, 10);
  assert.equal(result.skills.persuasion, 7);
  assert.deepEqual(result.spellcasting, { saveDc: 15, attackBonus: 7 });
});

test("rulesets cannot be silently mixed", () => {
  assert.throws(() => deriveCharacter(bard5r, rules5e2014), /character ruleset must be dnd5e-2014/);
  const converted = { ...bard5r, ruleset: "dnd5e-2014" };
  assert.equal(deriveCharacter(converted, rules5e2014).ruleset, "dnd5e-2014");
});
