import assert from "node:assert/strict";
import test from "node:test";

import { createCharacter, exportDocument, importDocument } from "../prototype/model.mjs";
import { WEAPON_CATALOG_5R } from "../prototype/weapon-catalog-5r.mjs";
import { catalogSpellRanks, itemPatchFromEntry, matchLocalSuggestions, mergeCatalogFields, spellPatchFromEntry, spellRankConflict, suggestionSearchParams, weaponPatchFromEntry } from "../prototype/suggestions.mjs";

test("an existing named spell flags a mismatched rank without overwriting custom spells", () => {
  const ranks = catalogSpellRanks("修复术", [
    { kind: "spell", name: "修复术", rank: 0 },
    { kind: "spell", name: "高等修复术", rank: 5 },
    { kind: "spell", name: "修复术", rank: 0 },
  ]);
  assert.deepEqual(ranks, [0]);
  assert.equal(spellRankConflict({ name: "修复术", level: 4 }, ranks), true);
  assert.equal(spellRankConflict({ name: "修复术", level: 0 }, ranks), false);
  assert.equal(spellRankConflict({ name: "修复术", level: 4, customRank: true }, ranks), false);
  assert.equal(spellRankConflict({ name: "自创法术", level: 4 }, []), false);
  const restored = importDocument(exportDocument(createCharacter({ spells: [{ name: "修复术", level: 4, customRank: true }] })));
  assert.equal(restored.spells[0].customRank, true);
});

test("spell suggestions carry the selected rank, including cantrips, without filtering other catalogs", () => {
  const spell = (rank) => suggestionSearchParams({ ruleset: "dnd5r-2024", kind: "spell", query: "火", rank });
  assert.equal(spell(0).get("rank"), "0");
  assert.equal(spell(3).get("rank"), "3");
  assert.equal(spell(3).get("query"), "火");
  assert.equal(suggestionSearchParams({ ruleset: "dnd5e-2014", kind: "item", query: "火", rank: 3 }).has("rank"), false);
});

test("keyword suggestions are case-insensitive and keep the input editable", () => {
  assert.deepEqual(matchLocalSuggestions(["匕首", "短棒", "长剑"], "首"), ["匕首"]);
  assert.deepEqual(matchLocalSuggestions(["Fireball", "Ball Lightning"], "ball"), ["Ball Lightning", "Fireball"]);
  assert.deepEqual(matchLocalSuggestions(["匕首"], "自创武器"), []);
});

test('species browsing supports pagination without changing the edition or keyword', () => {
  const first = suggestionSearchParams({ruleset:'dnd5e-2014',kind:'species',query:''});
  assert.equal(first.get('limit'),'25');
  assert.equal(first.get('offset'),'0');
  const next = suggestionSearchParams({ruleset:'dnd5r-2024',kind:'species',query:'精灵',offset:25});
  assert.equal(next.get('ruleset'),'dnd5r-2024');
  assert.equal(next.get('query'),'精灵');
  assert.equal(next.get('offset'),'25');
});

test("switching a catalog weapon updates defaults but preserves manual edits", () => {
  const first = WEAPON_CATALOG_5R["匕首"];
  const second = WEAPON_CATALOG_5R["短剑"];
  const edited = { ...first, properties: "玩家自定义特性", attackDie: "d20 + 7", bonus: 2 };
  const switched = mergeCatalogFields(edited, second, first);
  assert.equal(switched.properties, "玩家自定义特性");
  assert.equal(switched.damageDie, second.damageDie);
  assert.equal(switched.attackDie, "d20 + 7");
  assert.equal(switched.bonus, 2);
  const weapon = { ...switched, weaponType: "短剑", catalogType: "短剑", catalogDefaults: second };
  const restored = importDocument(exportDocument(createCharacter({ weapons: [weapon] })));
  assert.equal(restored.weapons[0].catalogDefaults.damageDie, second.damageDie);
  assert.equal(restored.weapons[0].properties, "玩家自定义特性");
});

test("5E entry mapping fills spell facts while keeping source flags accurate", () => {
  const spell = spellPatchFromEntry({ kind: "spell", name: "酸液飞溅", rank: 0, sourceBook: "玩家手册", payload: {
    学派: "咒法", 仪式: "x", 施法时间: "1动作", 施法距离: "60尺", "V 言语": "V", "S 姿势": "S", "M 材料": "×",
    持续时间: "立即", 法术详述: "法术效果", 职业列表: ["术士", "法师"],
  } });
  assert.equal(spell.name, "酸液飞溅");
  assert.equal(spell.level, 0);
  assert.equal(spell.classes, "术士、法师");
  assert.equal(spell.ritual, false);
  assert.equal(spell.verbal, true);
  assert.equal(spell.somatic, true);
  assert.equal(spell.materialComponent, false);
  assert.equal(spell.effect, "法术效果");
});

test("5E weapon and item mapping use imported fields without inventing bonuses", () => {
  assert.deepEqual(weaponPatchFromEntry({ kind: "weapon", payload: { 特性: "轻型", 伤害骰: "1d4", 伤害类型: "钝击" } }), {
    properties: "轻型", damageDie: "1d4", damageType: "钝击",
  });
  assert.deepEqual(itemPatchFromEntry({ kind: "item", name: "算盘", payload: { 描述: "计数工具", 重量: 2 } }), {
    name: "算盘", description: "计数工具", weight: 2,
  });
  assert.throws(() => itemPatchFromEntry({ kind: "curio", name: "自定义奇物" }), /不是物品资料/);
});

test("5R mapping keeps explicit concentration and weapon mastery without inventing bonuses", () => {
  const spell = spellPatchFromEntry({ kind: "spell", name: "测试专注术", rank: 2, payload: {
    专注: "√", 持续时间: "至多 1 分钟", 仪式: "×", "V 言语": "V", 法术详述: "测试内容",
  } });
  assert.equal(spell.concentration, true);
  assert.equal(spell.ritual, false);
  assert.deepEqual(weaponPatchFromEntry({ kind: "weapon", payload: { 伤害骰: "1d8", 伤害类型: "穿刺", 特性: "多用", 精通: "失衡" } }), {
    properties: "多用", damageDie: "1d8", damageType: "穿刺", mastery: "失衡",
  });
});

test("long imported background option text survives normalization", () => {
  const text = "甲".repeat(1815);
  const restored = importDocument(exportDocument(createCharacter({ backgroundSpecialOptions: text })));
  assert.equal(restored.backgroundSpecialOptions, text);
});
