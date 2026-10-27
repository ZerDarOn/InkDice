import test from "node:test";
import assert from "node:assert/strict";
import { createCharacter, deriveMvpCharacter, exportDocument, importDocument, normalizeCharacter } from "../prototype/model.mjs";
import { entryEligibility, multiclassIssues, parseLegacyMulticlass, spellClassNames, spellProgression, syncCharacterSlots, totalLevel, prerequisiteText } from "../prototype/character-rules.mjs";
import { DatabaseSync } from "node:sqlite";
import { searchLibrary, classOptions } from "../tools/library.mjs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const make = (overrides = {}) => createCharacter({ ruleset: "dnd5e-2014", classId: "wizard", level: 3, abilities: { str: 13, dex: 13, con: 14, int: 16, wis: 13, cha: 13 }, ...overrides });
const feat = (description) => ({ kind: "feat", payload: { 描述: description } });
test("multiclass uses total proficiency and each hit die, with only initial saves", () => {
  const c = make({ multiclasses: [{ classId: "fighter", level: 2 }] });
  const d = deriveMvpCharacter(c);
  assert.equal(d.level, 5); assert.equal(d.proficiencyBonus, 3); assert.equal(d.hitPoints, 36);
  assert.equal(d.hitDiceLabel, "3d6 + 2d10"); assert.deepEqual(d.classDefinition.saves, ["int", "wis"]);
});
test("2014 halves down and 2024 halves up for shared multiclass slots", () => {
  const c = make({ multiclasses: [{ classId: "paladin", level: 3 }] });
  assert.deepEqual(spellProgression(c).slots.slice(0, 3), [4, 3, 0]);
  c.ruleset = "dnd5r-2024";
  assert.deepEqual(spellProgression(c).slots.slice(0, 3), [4, 3, 2]);
});
test("one spellcasting class retains its own progression when multiclassing a noncaster", () => {
  const c = make({ classId: "paladin", level: 3, multiclasses: [{ classId: "fighter", level: 1 }] });
  assert.equal(spellProgression(c).slots[0], 3);
  assert.equal(spellProgression(make({ classId: "paladin", level: 1 })).slots[0], 0);
  c.ruleset = "dnd5r-2024"; c.level = 1;
  assert.equal(spellProgression(c).slots[0], 2);
});
test("pact slots are separate and both pools preserve expenditure on level changes", () => {
  const c = make({ multiclasses: [{ classId: "warlock", level: 2 }] });
  syncCharacterSlots(c);
  assert.deepEqual(c.pactSlots, { level: 1, maximum: 2, current: 2 });
  assert.equal(c.spellSlots[1].maximum, 4); assert.equal(c.spellSlots[2].maximum, 2);
  c.spellSlots[1].current = 2; c.pactSlots.current = 1; c.level = 4; c.multiclasses[0].level = 3;
  syncCharacterSlots(c);
  assert.equal(c.spellSlots[1].current, 2); assert.deepEqual(c.pactSlots, { level: 2, maximum: 2, current: 1 });
});
test("learnable spell rank belongs to the class, not the combined slot pool", () => {
  const c = make({ multiclasses: [{ classId: "cleric", level: 2 }] });
  assert.equal(spellProgression(c).slots[2], 2);
  const entry = { kind: "spell", rank: 3, payload: { 职业列表: ["法师", "牧师"] } };
  assert.equal(entryEligibility(entry, c, { castingClassId: "wizard" }).status, "blocked");
  entry.rank = 2;
  assert.equal(entryEligibility(entry, c, { castingClassId: "wizard" }).status, "eligible");
  assert.equal(entryEligibility(entry, c, { castingClassId: "cleric" }).status, "blocked");
  assert.equal(entryEligibility(entry, c, { castingClassId: "other" }).status, "eligible");
});
test("third casters use wizard list and Intelligence without treating all fighters as casters", () => {
  const c = make({ classId: "fighter", level: 3, subclass: "奥法骑士" });
  assert.deepEqual(spellClassNames(c, "fighter"), ["法师"]);
  assert.equal(deriveMvpCharacter(c).castingAbility, "int");
  assert.equal(spellProgression(c).slots[0], 2);
  c.subclass = "战斗大师";
  assert.equal(deriveMvpCharacter(c).spellcasting, null);
});
test("legacy multiclass parsing preserves unresolved notes and round trips structure", () => {
  const result = parseLegacyMulticlass("战士2级 / 1级邪术师 / 团规待定");
  assert.equal(result.classes.length, 2); assert.equal(result.unresolved, "团规待定");
  const c = normalizeCharacter(make({ multiclass: "战士2", subclass: "塑能学派", spells: [{ name: "护盾术", castingClassId: "wizard" }] }));
  assert.equal(totalLevel(c), 5);
  const restored = importDocument(JSON.parse(JSON.stringify(exportDocument(c))));
  assert.deepEqual(restored.multiclasses, c.multiclasses); assert.equal(restored.subclass, "塑能学派");
  assert.equal(restored.spells[0].castingClassId, "wizard");
});
test("class, subclass and class level prerequisites are checked independently", () => {
  const c = make({ classId: "bard", level: 3, subclass: "舞蹈学院" });
  const e = { kind: "class_feature", payload: { 职业: "吟游诗人", 规则关联: { className: "吟游诗人", subclass: "舞蹈学院", minLevel: 6 } } };
  assert.equal(entryEligibility(e, c).status, "blocked");
  c.level = 6; assert.equal(entryEligibility(e, c).status, "eligible");
  c.subclass = "逸闻学院"; assert.equal(entryEligibility(e, c).status, "blocked");
  e.payload.规则关联 = {}; assert.equal(entryEligibility(e, c).status, "review");
});
test("feats check ability alternatives, class membership, spellcasting and armor training", () => {
  const c = make({ classId: "fighter", level: 4, abilities: { str: 8, dex: 14, int: 10 } });
  assert.equal(entryEligibility(feat("通用专长（先决：等级4+，力量或敏捷13+）"), c).status, "eligible");
  assert.equal(entryEligibility(feat("先决：施法或契约魔法特性"), c).status, "blocked");
  assert.equal(entryEligibility(feat("先决：战士职业"), c).status, "eligible");
  assert.equal(entryEligibility(feat("先决：术士职业"), c).status, "blocked");
  assert.equal(entryEligibility(feat("先决：中甲受训"), c).status, "eligible");
  assert.equal(entryEligibility(feat("先决：等级4+，某专长或施法特性"), c).status, "review");
  assert.equal(prerequisiteText("你模仿声音的前提条件是你听过一分钟。"), "");
});
test("multiclass prerequisites include original class and keep invalid totals visible", () => {
  const c = make({ level: 19, multiclasses: [{ classId: "fighter", level: 2 }], abilities: { int: 10, str: 13 } });
  assert.ok(multiclassIssues(c).some((s) => s.includes("超过 20")));
  assert.ok(multiclassIssues(c).some((s) => s.includes("法师")));
  assert.equal(syncCharacterSlots(c), false); assert.equal(deriveMvpCharacter(c).level, 20); assert.equal(totalLevel(c), 21);
});

const dbPath = fileURLToPath(new URL("../local-data/content-library.sqlite", import.meta.url));
test('5E subclass columns are separate from feature pairs, and fighting styles have their own catalog', {skip:!existsSync(dbPath)},()=>{
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try {
    const ruleset='dnd5e-2014';
    const classes=classOptions(db,{ruleset}).results;
    const fighter=classes.find(c=>c.classId==='fighter').payload.规则关联.subclasses;
    assert.ok(fighter.some(s=>s.name.includes('战斗大师')));
    assert.ok(!fighter.some(s=>s.name.includes('狂战士')));
    const features=searchLibrary(db,{ruleset,kind:'class_feature',query:'狂战士'});
    assert.equal(features.total,0);
    for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
      assert.ok(searchLibrary(db,{ruleset,kind:'fighting_style',query:'防御'}).total>0);
      assert.ok(!searchLibrary(db,{ruleset,kind:'feat',query:'防御'}).results.some(e=>e.name==='防御'));
    }
  } finally {db.close();}
});
test("source workbook formula links filter actual 5R subclass features and both spell catalogs", { skip: !existsSync(dbPath) }, () => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const c = make({ ruleset: "dnd5r-2024", classId: "bard", subclass: "舞蹈学院" });
    const catalog = classOptions(db, { ruleset: c.ruleset });
    assert.ok(catalog.results.find((r) => r.classId === "bard").payload.规则关联.subclasses.some((s) => s.name === "舞蹈学院" && s.minLevel === 3));
    const result = searchLibrary(db, { ruleset: c.ruleset, kind: "class_feature", context: JSON.stringify(c), limit: 50 });
    assert.ok(result.results.some((e) => e.payload.规则关联.subclass === "舞蹈学院"));
    assert.ok(result.results.every((e) => !e.payload.规则关联.subclass || e.payload.规则关联.subclass === "舞蹈学院"));
    for (const ruleset of ["dnd5e-2014", "dnd5r-2024"]) {
      const context = JSON.stringify(make({ ruleset }));
      const spells = searchLibrary(db, { ruleset, kind: "spell", rank: 1, context, castingClassId: "wizard", limit: 50 });
      assert.ok(spells.total > 0);
      assert.ok(spells.results.every((e) => e.payload.职业列表.includes("法师") && e.rank === 1));
    }
  } finally { db.close(); }
});
