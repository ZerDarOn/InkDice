import assert from "node:assert/strict";
import test from "node:test";

import { ATTUNEMENT_LIMIT, createCharacter, deriveMvpCharacter, exportDocument, getAttunedEquipment, importDocument, normalizeCharacter, orderSpellsForBook, validateCharacter } from "../prototype/model.mjs";
import { WEAPON_CATALOG_5R } from "../prototype/weapon-catalog-5r.mjs";

test("5R weapon lookup matches the supplied workbook's dagger entry", () => {
  assert.equal(Object.keys(WEAPON_CATALOG_5R).length, 80);
  assert.deepEqual(WEAPON_CATALOG_5R["匕首"], { damageDie: "1d4", damageType: "穿刺", properties: "灵巧，轻型，投掷（射程 20/60）", mastery: "迅击" });
});

test("MVP character defaults form a calculable 5R bard", () => {
  const character = createCharacter({ name: "试作角色", level: 5, armorId: "studdedLeather" });
  const derived = deriveMvpCharacter(character);
  assert.equal(derived.ruleset, "dnd5r-2024");
  assert.equal(derived.proficiencyBonus, 3);
  assert.equal(derived.armorClass, 14);
  assert.equal(derived.hitPoints, 33);
});

test("edition selection stays explicit", () => {
  const character = createCharacter({ ruleset: "dnd5e-2014", classId: "wizard", level: 9, abilities: { int: 18 } });
  const derived = deriveMvpCharacter(character);
  assert.equal(derived.ruleset, "dnd5e-2014");
  assert.deepEqual(derived.spellcasting, { saveDc: 16, attackBonus: 8 });
});

test("normalization bounds imported data without executing it", () => {
  const normalized = normalizeCharacter({ name: 123, classId: "unknown", level: 99, abilities: { str: "oops" }, skills: { stealth: 9 } });
  assert.equal(normalized.name, "123");
  assert.equal(normalized.classId, "bard");
  assert.equal(normalized.level, 1);
  assert.equal(normalized.abilities.str, 10);
  assert.equal(normalized.skills.stealth, 0);
});

test("feature ledger and 5R spell flags survive import and export", () => {
  const original = createCharacter({
    featureEntries: [{ id: "feature-1", kind: "special", name: "战技骰", description: "可消耗", current: 2, maximum: 4, recovery: "短休" }],
    spells: [{ id: "spell-1", name: "示例法术", level: 2, prepared: true, classes: "法师", source: "法术大全", ritual: true, concentration: true }],
    weaponProficiencies: "简易武器",
    armorTraining: "轻甲",
    equipmentLoad: 12.5,
    carryingCapacity: 150,
  });
  const restored = importDocument(exportDocument(original));
  assert.equal(restored.featureEntries[0].name, "战技骰");
  assert.equal(restored.featureEntries[0].recovery, "短休");
  assert.equal(restored.spells[0].concentration, true);
  assert.equal(restored.spells[0].ritual, true);
  assert.equal(restored.spells[0].prepared, true);
  assert.equal(restored.spells[0].classes, "法师");
  assert.equal(restored.spells[0].source, "法术大全");
  assert.equal(restored.weaponProficiencies, "简易武器");
  assert.equal(restored.armorTraining, "轻甲");
  assert.equal(restored.equipmentLoad, 12.5);
  assert.equal(restored.carryingCapacity, 150);
});

test("5R spell index places prepared spells first by level and renumbers the display order", () => {
  const spells = [
    { id: "a", level: 2, prepared: false },
    { id: "b", level: 3, prepared: true },
    { id: "c", level: 1, prepared: true },
    { id: "d", level: 1, prepared: true },
    { id: "e", level: 0, prepared: false },
  ];
  assert.deepEqual(orderSpellsForBook(spells).map(({ id }) => id), ["c", "d", "b", "e", "a"]);
  assert.deepEqual(spells.map(({ id }) => id), ["a", "b", "c", "d", "e"]);
  const legacy = normalizeCharacter({ spells: [{ id: "legacy", name: "旧法术", source: "准备", level: 1 }] });
  assert.equal(legacy.spells[0].prepared, true);
  assert.equal(legacy.spells[0].source, "");
});

test("export and import round trip character meaning", () => {
  const original = createCharacter({
    name: "往返测试",
    player: "测试玩家",
    background: "学者",
    characterImage: "总穿深蓝长袍，神情专注。",
    backgroundSkillProficiencies: "奥秘、历史",
    backgroundToolProficiencies: "书法工具",
    backgroundLanguages: "精灵语",
    backgroundEquipment: "墨水、羽毛笔、旧书",
    backgroundSpecialOptions: "研究专长",
    backgroundFeature: "研究员：知道去哪里寻找线索。",
    personalityTwo: "习惯先记录再行动",
    combatPrimaryEquipment: "长剑",
    combatOffhandEquipment: "盾牌",
    combatBackupEquipment: "短弓",
    equipmentArmor: "精制镶钉皮甲",
    equipmentRightHand: "仪式长剑",
    equipmentLeftHand: "圆盾",
    equipmentTwoHand: "长弓",
    equipmentHead: "侦测头环",
    equipmentFeet: "精灵靴",
    equipmentArmorAttuned: true,
    equipmentHeadAttuned: true,
    equipmentFeetAttuned: false,
    flaw: "过度好奇",
    skills: { persuasion: 2 },
    spells: [{ id: "spell-1", name: "魔法飞弹", level: 1, prepared: true }],
    deployedCreatures: [{ id: "pet-1", name: "渡鸦", type: "魔宠", armorClass: 12, hitPoints: 1 }],
    inventory: [{ id: "item-1", name: "匕首", quantity: 2, weight: 1 }],
    currency: { gp: 18, sp: 4 },
  });
  const restored = importDocument(exportDocument(original));
  assert.equal(restored.id, original.id);
  assert.equal(restored.name, original.name);
  assert.equal(restored.skills.persuasion, 2);
  assert.equal(restored.background, "学者");
  assert.equal(restored.characterImage, "总穿深蓝长袍，神情专注。");
  assert.equal(restored.backgroundSkillProficiencies, "奥秘、历史");
  assert.equal(restored.backgroundToolProficiencies, "书法工具");
  assert.equal(restored.backgroundLanguages, "精灵语");
  assert.equal(restored.backgroundEquipment, "墨水、羽毛笔、旧书");
  assert.equal(restored.backgroundSpecialOptions, "研究专长");
  assert.equal(restored.backgroundFeature, "研究员：知道去哪里寻找线索。");
  assert.equal(restored.personalityTwo, "习惯先记录再行动");
  assert.equal(restored.combatPrimaryEquipment, "长剑");
  assert.equal(restored.combatOffhandEquipment, "盾牌");
  assert.equal(restored.combatBackupEquipment, "短弓");
  assert.equal(restored.equipmentArmor, "精制镶钉皮甲");
  assert.equal(restored.equipmentRightHand, "仪式长剑");
  assert.equal(restored.equipmentLeftHand, "圆盾");
  assert.equal(restored.equipmentTwoHand, "长弓");
  assert.equal(restored.equipmentHead, "侦测头环");
  assert.equal(restored.equipmentFeet, "精灵靴");
  assert.equal(restored.equipmentArmorAttuned, true);
  assert.equal(restored.equipmentHeadAttuned, true);
  assert.equal(restored.equipmentFeetAttuned, false);
  assert.equal(restored.flaw, "过度好奇");
  assert.equal(restored.player, "测试玩家");
  assert.equal(restored.spells[0].name, "魔法飞弹");
  assert.equal(restored.deployedCreatures[0].name, "渡鸦");
  assert.equal(restored.inventory[0].quantity, 2);
  assert.equal(restored.currency.gp, 18);
});

test("legacy combat equipment migrates into fixed hand slots", () => {
  const restored = normalizeCharacter({ combatPrimaryEquipment: "长剑", combatOffhandEquipment: "匕首", combatBackupEquipment: "长弓" });
  assert.equal(restored.equipmentRightHand, "长剑");
  assert.equal(restored.equipmentLeftHand, "匕首");
  assert.equal(restored.equipmentTwoHand, "长弓");
  assert.deepEqual(restored.weapons.slice(0, 3).map((item) => item.name), ["长剑", "匕首", "长弓"]);
  const oldAttack = normalizeCharacter({ attacks: [{ name: "战锤", attackBonus: 5, damage: "1d8+3", damageType: "钝击" }] });
  assert.equal(oldAttack.weapons[0].name, "战锤");
  assert.equal(oldAttack.weapons[0].damageDie, "1d8+3");
});

test("5R armor, weapons, shield and curios share one attunement counter", () => {
  const character = createCharacter({
    equipmentArmor: "精制镶钉皮甲",
    equipmentArmorAttuned: true,
    weapons: [{ weaponType: "长剑", name: "仪式长剑", attuned: true }],
    curios: [{ name: "侦测头环", slot: "头部", rarity: "珍稀", attuned: true }],
  });
  const attuned = getAttunedEquipment(character);
  assert.equal(ATTUNEMENT_LIMIT, 3);
  assert.deepEqual(attuned.map(({ label, name }) => ({ label, name })), [
    { label: "护甲", name: "精制镶钉皮甲" },
    { label: "武器 1", name: "仪式长剑" },
    { label: "头部", name: "侦测头环" },
  ]);
  assert.ok(!validateCharacter(character).some((entry) => entry.field === "attunementCount"));
  character.shieldAttuned = true;
  assert.ok(validateCharacter(character).some((entry) => entry.field === "attunementCount" && entry.severity === "warning"));
});

test("5R equipment has exactly five weapon and ten curio rows and round trips all fields", () => {
  const character = createCharacter({
    armorId: "chainShirt", armorBonus: 1, armorProperty: "秘银", shield: true, shieldName: "圆盾", shieldAcBonus: 3, shieldAttuned: true,
    weapons: [{ weaponType: "短弓", name: "旅人短弓", bonus: 2, properties: "弹药", proficient: true, attackDie: "d20+7", damageDie: "1d6+5", damageType: "穿刺", extraDamageDie: "1d4", extraDamageType: "火焰", mastery: "缓速", effect: "命中时生效", attuned: true }],
    curios: [{ name: "疾行靴", rarity: "珍稀", slot: "双脚", properties: "速度+10", attuned: true }],
  });
  const restored = importDocument(exportDocument(character));
  assert.equal(restored.weapons.length, 1);
  assert.equal(restored.curios.length, 10);
  assert.equal(restored.weapons[0].extraDamageType, "火焰");
  assert.equal(restored.curios[0].slot, "双脚");
  assert.equal(restored.armorProperty, "秘银");
  assert.equal(restored.shieldName, "圆盾");
  assert.equal(getAttunedEquipment(restored).length, 3);
  assert.equal(deriveMvpCharacter(restored).armorClass, 19);
});

test("validation reports blank names and homebrew ability scores", () => {
  const issues = validateCharacter(createCharacter({ name: "", abilities: { cha: 24 } }));
  assert.ok(issues.some((entry) => entry.field === "name" && entry.severity === "error"));
  assert.ok(issues.some((entry) => entry.field === "ability-cha" && entry.severity === "warning"));
});

test("temporarily invalid form values still produce a safe preview", () => {
  const character = createCharacter({ level: 0, abilities: { dex: 0 } });
  const derived = deriveMvpCharacter(character);
  const issues = validateCharacter(character);
  assert.equal(derived.level, 1);
  assert.ok(issues.some((entry) => entry.field === "level" && entry.severity === "error"));
  assert.ok(issues.some((entry) => entry.field === "ability-dex" && entry.severity === "error"));
});
