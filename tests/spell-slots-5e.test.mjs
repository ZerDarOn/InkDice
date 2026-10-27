import assert from "node:assert/strict";
import test from "node:test";
import { createCharacter } from "../prototype/model.mjs";
import { get5eSpellSlotProgression, sync5eSpellSlots } from "../packages/rules-5e-2014/spell-slots.mjs";

test("2014 full caster spell slots progress through 20th level", () => {
  assert.deepEqual(get5eSpellSlotProgression("wizard", 1).slots, [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(get5eSpellSlotProgression("bard", 5).slots, [4, 3, 2, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(get5eSpellSlotProgression("cleric", 20).slots, [4, 3, 3, 3, 3, 2, 2, 1, 1]);
});

test("2014 paladin and ranger start casting at level 2", () => {
  assert.deepEqual(get5eSpellSlotProgression("paladin", 1).slots, Array(9).fill(0));
  assert.deepEqual(get5eSpellSlotProgression("paladin", 2).slots.slice(0, 5), [2, 0, 0, 0, 0]);
  assert.deepEqual(get5eSpellSlotProgression("ranger", 5).slots.slice(0, 5), [4, 2, 0, 0, 0]);
  assert.deepEqual(get5eSpellSlotProgression("paladin", 20).slots.slice(0, 5), [4, 3, 3, 3, 2]);
});

test("2014 pact slots occupy one slot level and recover on a short rest", () => {
  const first = get5eSpellSlotProgression("warlock", 1);
  const fifth = get5eSpellSlotProgression("warlock", 5);
  const last = get5eSpellSlotProgression("warlock", 20);
  assert.equal(first.kind, "pact");
  assert.equal(first.recovery, "短休或长休");
  assert.deepEqual(first.slots, [1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(fifth.slots, [0, 0, 2, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(last.slots, [0, 0, 0, 0, 4, 0, 0, 0, 0]);
});

test("sync preserves spent slots on level change and skips multiclass", () => {
  const wizard = createCharacter({ ruleset: "dnd5e-2014", classId: "wizard", level: 4 });
  assert.equal(sync5eSpellSlots(wizard), true);
  assert.deepEqual(wizard.spellSlots["1"], { current: 4, maximum: 4 });
  wizard.spellSlots["1"].current = 2;
  wizard.level = 5;
  sync5eSpellSlots(wizard, { preserveSpent: true });
  assert.deepEqual(wizard.spellSlots["1"], { current: 2, maximum: 4 });
  assert.deepEqual(wizard.spellSlots["3"], { current: 2, maximum: 2 });
  wizard.multiclass = "战士 1";
  assert.equal(sync5eSpellSlots(wizard), false);
  assert.deepEqual(wizard.spellSlots["1"], { current: 2, maximum: 4 });
});

test("noncasters stay at zero without clearing another ruleset", () => {
  assert.deepEqual(get5eSpellSlotProgression("fighter", 12).slots, Array(9).fill(0));
  const character = createCharacter({ ruleset: "dnd5r-2024", classId: "wizard" });
  character.spellSlots["1"] = { current: 3, maximum: 4 };
  assert.equal(sync5eSpellSlots(character), false);
  assert.deepEqual(character.spellSlots["1"], { current: 3, maximum: 4 });
});
