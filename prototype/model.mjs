import { deriveCharacter } from "../packages/rules-core/index.mjs";
import {isCoc,createCoc,normalizeCoc,validateCoc} from './coc/model.mjs';
import { characterEffects } from "./effects.mjs";
import { normalizeFillEffects } from './fill-effects.mjs';
import { buildCalculationTrace } from './assistant-trace.mjs';
import { classMechanics, spellCapacity, loadSummary } from './automation.mjs';
import { normalizeHitDiceSpent, syncHitDice, hitDiceState } from './hit-dice.mjs';
import { normalizeSkillChoices } from './skill-grants.mjs';
import { normalizeFeatChoices } from './advancement.mjs';
import { normalizeProficiencyChoices,proficiencyGrantState } from './proficiency-grants.mjs';
import { normalizeStartingChoices,normalizeStartingReceipt } from './starting-equipment.mjs';
import { rules5e2014 } from "../packages/rules-5e-2014/adapter.mjs";
import { rules5r2024 } from "../packages/rules-5r-2024/adapter.mjs";
import { ABILITIES, ARMORS, CLASSES, RULESETS, SKILLS } from "./content.mjs";
import { characterClasses, multiclassIssues, parseLegacyMulticlass, spellProgression, totalLevel } from "./character-rules.mjs";

const ADAPTERS = {
  "dnd5r-2024": rules5r2024,
  "dnd5e-2014": rules5e2014,
};

export const ATTUNEMENT_LIMIT = 3;
export const WEAPON_ROW_COUNT = 2;
export const CURIO_ROW_COUNT = 10;
export const EQUIPMENT_SLOTS = [
  { field: "equipmentArmor", attunementField: "equipmentArmorAttuned", label: "护甲" },
  { field: "equipmentRightHand", attunementField: "equipmentRightHandAttuned", label: "右手" },
  { field: "equipmentLeftHand", attunementField: "equipmentLeftHandAttuned", label: "左手" },
  { field: "equipmentTwoHand", attunementField: "equipmentTwoHandAttuned", label: "双手" },
  { field: "equipmentHead", attunementField: "equipmentHeadAttuned", label: "头部" },
  { field: "equipmentNeck", attunementField: "equipmentNeckAttuned", label: "颈部" },
  { field: "equipmentShoulders", attunementField: "equipmentShouldersAttuned", label: "肩部" },
  { field: "equipmentBack", attunementField: "equipmentBackAttuned", label: "背部" },
  { field: "equipmentChest", attunementField: "equipmentChestAttuned", label: "胸部" },
  { field: "equipmentWrists", attunementField: "equipmentWristsAttuned", label: "腕部" },
  { field: "equipmentHands", attunementField: "equipmentHandsAttuned", label: "手部" },
  { field: "equipmentWaist", attunementField: "equipmentWaistAttuned", label: "腰部" },
  { field: "equipmentLegs", attunementField: "equipmentLegsAttuned", label: "腿部" },
  { field: "equipmentFeet", attunementField: "equipmentFeetAttuned", label: "脚部" },
];

export function createCharacter(overrides = {}) {
  if(isCoc(overrides))return createCoc(overrides);
  const now = new Date().toISOString();
  const id = overrides.id ?? createId();
  const defaultSkills = Object.fromEntries(Object.keys(SKILLS).map((skill) => [skill, 0]));
  return {
    schemaVersion: "0.1.0-mvp",
    id,
    name: "未命名角色",
    player: "",
    ruleset: "dnd5r-2024",
    classId: "bard",
    level: 1,
    abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    armorId: "leather",
    armorBonus: 0,
    armorProperty: "",
    shieldName: "",
    shieldAttuned: false,
    shieldAcBonus: 2,
    weaponAttackAbility: "dex",
    ammunitionName: "",
    ammunitionCount: 0,
    weapons: [],
    curios: [],
    shield: false,
    speed: 30,
    skills: defaultSkills,
    portrait: "",
    background: "",
    species: "",
    subrace: "",
    gender: "",
    alignment: "",
    age: "",
    faith: "",
    height: "",
    weight: "",
    hair: "",
    skin: "",
    eyes: "",
    appearance: "",
    characterImage: "",
    backgroundSkillProficiencies: "",
    backgroundToolProficiencies: "",
    backgroundLanguages: "",
    backgroundEquipment: "",
    backgroundSpecialOptions: "",
    backgroundFeature: "",
    backgroundStory: "",
    personality: "",
    personalityTwo: "",
    ideal: "",
    bond: "",
    flaw: "",
    notes: "",
    experience: 0,
    multiclass: "",
    size: "中型",
    currentHp: 0,
    tempHp: 0,
    hitDiceCurrent: 1,
    combatProficiencies: "",
    languagesTools: "",
    classFeatures: "",
    speciesFeatures: "",
    feats: "",
    featureEntries: [],
    resourceSpent: {},
    concentrationSpellId: null,
    weaponProficiencies: "",
    armorTraining: "",
    knownLanguages: "",
    toolProficiencies: "",
    inspiration: "",
    injuries: "",
    renown: "",
    piety: "",
    blessings: "",
    charms: "",
    epicBoons: "",
    equipmentLoad: null,
    carryingCapacity: null,
    defensesSenses: "",
    resistances: String(overrides.resistances || '').slice(0, 1000),
    immunities: String(overrides.immunities || '').slice(0, 1000),
    senses: String(overrides.senses || '').slice(0, 1000),
    backgroundSource: overrides.backgroundSource || null,
    backgroundAbilityBonuses: Object.fromEntries(Object.keys(ABILITIES).map(id => [id, clampInteger(overrides.backgroundAbilityBonuses?.[id], 0, 2, 0)])),
    combatPrimaryEquipment: "",
    combatOffhandEquipment: "",
    combatBackupEquipment: "",
    equipmentArmor: "",
    equipmentRightHand: "",
    equipmentLeftHand: "",
    equipmentTwoHand: "",
    equipmentHead: "",
    equipmentNeck: "",
    equipmentShoulders: "",
    equipmentBack: "",
    equipmentChest: "",
    equipmentWrists: "",
    equipmentHands: "",
    equipmentWaist: "",
    equipmentLegs: "",
    equipmentFeet: "",
    equipmentArmorAttuned: false,
    equipmentRightHandAttuned: false,
    equipmentLeftHandAttuned: false,
    equipmentTwoHandAttuned: false,
    equipmentHeadAttuned: false,
    equipmentNeckAttuned: false,
    equipmentShouldersAttuned: false,
    equipmentBackAttuned: false,
    equipmentChestAttuned: false,
    equipmentWristsAttuned: false,
    equipmentHandsAttuned: false,
    equipmentWaistAttuned: false,
    equipmentLegsAttuned: false,
    equipmentFeetAttuned: false,
    attunementSlot1: "",
    attunementSlot2: "",
    attunementSlot3: "",
    attacks: [],
    spells: [],
    spellSlots: defaultSpellSlots(),
    deployedCreatures: [],
    inventory: [],
    ledger: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
    equipmentArmor: overrides.equipmentArmor ?? "",
    equipmentRightHand: overrides.equipmentRightHand ?? overrides.combatPrimaryEquipment ?? "",
    equipmentLeftHand: overrides.equipmentLeftHand ?? overrides.combatOffhandEquipment ?? "",
    equipmentTwoHand: overrides.equipmentTwoHand ?? overrides.combatBackupEquipment ?? "",
    equipmentHead: overrides.equipmentHead ?? "",
    equipmentNeck: overrides.equipmentNeck ?? "",
    equipmentShoulders: overrides.equipmentShoulders ?? "",
    equipmentBack: overrides.equipmentBack ?? "",
    equipmentChest: overrides.equipmentChest ?? "",
    equipmentWrists: overrides.equipmentWrists ?? "",
    equipmentHands: overrides.equipmentHands ?? "",
    equipmentWaist: overrides.equipmentWaist ?? "",
    equipmentLegs: overrides.equipmentLegs ?? "",
    equipmentFeet: overrides.equipmentFeet ?? "",
    equipmentArmorAttuned: normalizeBoolean(overrides.equipmentArmorAttuned),
    equipmentRightHandAttuned: normalizeBoolean(overrides.equipmentRightHandAttuned),
    equipmentLeftHandAttuned: normalizeBoolean(overrides.equipmentLeftHandAttuned),
    equipmentTwoHandAttuned: normalizeBoolean(overrides.equipmentTwoHandAttuned),
    equipmentHeadAttuned: normalizeBoolean(overrides.equipmentHeadAttuned),
    equipmentNeckAttuned: normalizeBoolean(overrides.equipmentNeckAttuned),
    equipmentShouldersAttuned: normalizeBoolean(overrides.equipmentShouldersAttuned),
    equipmentBackAttuned: normalizeBoolean(overrides.equipmentBackAttuned),
    equipmentChestAttuned: normalizeBoolean(overrides.equipmentChestAttuned),
    equipmentWristsAttuned: normalizeBoolean(overrides.equipmentWristsAttuned),
    equipmentHandsAttuned: normalizeBoolean(overrides.equipmentHandsAttuned),
    equipmentWaistAttuned: normalizeBoolean(overrides.equipmentWaistAttuned),
    equipmentLegsAttuned: normalizeBoolean(overrides.equipmentLegsAttuned),
    equipmentFeetAttuned: normalizeBoolean(overrides.equipmentFeetAttuned),
    abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15, ...(overrides.abilities ?? {}) },
    skills: { ...defaultSkills, ...(overrides.skills ?? {}) },
    skillChoices: normalizeSkillChoices(overrides.skillChoices),
    featAbilityChoices: normalizeFeatChoices(overrides.featAbilityChoices),
    startingEquipmentChoices: normalizeStartingChoices(overrides.startingEquipmentChoices),
    startingEquipmentReceipt: normalizeStartingReceipt(overrides.startingEquipmentReceipt,normalizeInventoryItem),
    proficiencyChoices: normalizeProficiencyChoices(overrides.proficiencyChoices),
    hitDiceSpent: normalizeHitDiceSpent(overrides.hitDiceSpent),
    attacks: normalizeRecords(overrides.attacks, normalizeAttack),
    spells: normalizeRecords(overrides.spells, normalizeSpell),
    spellSlots: normalizeSpellSlots(overrides.spellSlots),
    subclass: String(overrides.subclass || "").slice(0, 120),
    multiclasses: (Array.isArray(overrides.multiclasses) ? overrides.multiclasses : parseLegacyMulticlass(overrides.multiclass).classes)
      .slice(0, 12).filter((c) => CLASSES[c.classId]).map((c) => ({ classId: c.classId, level: clampInteger(c.level, 1, 20, 1), subclass: String(c.subclass || "").slice(0, 120) })),
    multiclassUnresolved: String(overrides.multiclassUnresolved ?? (Array.isArray(overrides.multiclasses) ? "" : parseLegacyMulticlass(overrides.multiclass).unresolved)).slice(0, 200),
    spellcastingClassId: String(overrides.spellcastingClassId || ""),
    pactSlots: { level: clampInteger(overrides.pactSlots?.level, 0, 5, 0), current: clampInteger(overrides.pactSlots?.current, 0, 99, 0), maximum: clampInteger(overrides.pactSlots?.maximum, 0, 99, 0) },
    deployedCreatures: normalizeRecords(overrides.deployedCreatures, normalizeCreature),
    inventory: normalizeRecords(overrides.inventory, normalizeInventoryItem),
    ledger: normalizeRecords(overrides.ledger, normalizeLedgerEntry),
    currency: normalizeCurrency(overrides.currency),
    armorBonus: clampInteger(overrides.armorBonus, -5, 10, 0),
    armorProperty: String(overrides.armorProperty ?? "").slice(0, 500),
    shieldName: String(overrides.shieldName ?? "").slice(0, 160),
    shieldAttuned: normalizeBoolean(overrides.shieldAttuned),
    shieldAcBonus: clampInteger(overrides.shieldAcBonus, 0, 10, 2),
    weaponAttackAbility: overrides.weaponAttackAbility === "str" ? "str" : "dex",
    ammunitionName: String(overrides.ammunitionName ?? "").slice(0, 60),
    ammunitionCount: clampInteger(overrides.ammunitionCount, 0, 99999, 0),
    weapons: normalizeWeapons(overrides),
    curios: normalizeCurios(overrides),
  };
}

export function normalizeCharacter(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("人物文件必须是一个 JSON 对象");
  if(isCoc(raw))return normalizeCoc(raw);
  const normalized = createCharacter(raw);
  normalized.name = String(raw.name ?? "未命名角色").slice(0, 60);
  normalized.player = String(raw.player ?? "").slice(0, 60);
  normalized.notes = String(raw.notes ?? "").slice(0, 5000);
  normalized.portrait = typeof raw.portrait === "string" && raw.portrait.startsWith("data:image/") ? raw.portrait.slice(0, 2_000_000) : "";
  normalized.background = String(raw.background ?? "").slice(0, 120);
  const fullBackgroundSpecialOptions = String(raw.backgroundSpecialOptions ?? "").slice(0, 2000);
  for (const [field, maximum] of Object.entries({ species: 80, subrace: 80, gender: 40, alignment: 60, age: 40, faith: 80, height: 40, weight: 40, hair: 60, skin: 60, eyes: 60, appearance: 1200, characterImage: 1200, backgroundSkillProficiencies: 500, backgroundToolProficiencies: 500, backgroundLanguages: 500, backgroundEquipment: 1000, backgroundSpecialOptions: 1000, backgroundFeature: 2000, backgroundStory: 3000, personalityTwo: 500, multiclass: 100, size: 20, combatProficiencies: 1500, languagesTools: 1500, classFeatures: 3000, speciesFeatures: 3000, feats: 3000, weaponProficiencies: 1000, armorTraining: 1000, knownLanguages: 1000, toolProficiencies: 1000, inspiration: 40, injuries: 500, renown: 500, piety: 500, blessings: 500, charms: 500, epicBoons: 500, defensesSenses: 2000, combatPrimaryEquipment: 120, combatOffhandEquipment: 120, combatBackupEquipment: 120, equipmentArmor: 160, equipmentRightHand: 160, equipmentLeftHand: 160, equipmentTwoHand: 160, equipmentHead: 160, equipmentNeck: 160, equipmentShoulders: 160, equipmentBack: 160, equipmentChest: 160, equipmentWrists: 160, equipmentHands: 160, equipmentWaist: 160, equipmentLegs: 160, equipmentFeet: 160, attunementSlot1: 160, attunementSlot2: 160, attunementSlot3: 160 })) normalized[field] = String(raw[field] ?? normalized[field] ?? "").slice(0, maximum);
  normalized.weaponProficiencies ||= normalized.combatProficiencies;
  normalized.backgroundSpecialOptions = fullBackgroundSpecialOptions;
  normalized.knownLanguages ||= normalized.languagesTools;
  normalized.featureEntries = Array.isArray(raw.featureEntries) ? raw.featureEntries.slice(0, 120).map(normalizeFeatureEntry) : [
    ["class", raw.classFeatures], ["species", raw.speciesFeatures], ["feat", raw.feats],
  ].filter(([, description]) => typeof description === "string" && description.trim()).map(([kind, description]) => normalizeFeatureEntry({ kind, name: "原有内容", description }));
  normalized.speciesFeatureArchive = Array.isArray(raw.speciesFeatureArchive) ? raw.speciesFeatureArchive.map(normalizeFeatureEntry) : [];
  normalized.speciesFeatureContext = String(raw.speciesFeatureContext||'').slice(0,400);
  normalized.speciesEntryId = String(raw.speciesEntryId||'').slice(0,200);
  normalized.personality = String(raw.personality ?? "").slice(0, 500);
  normalized.ideal = String(raw.ideal ?? "").slice(0, 300);
  normalized.bond = String(raw.bond ?? "").slice(0, 300);
  normalized.flaw = String(raw.flaw ?? "").slice(0, 300);
  normalized.experience = clampInteger(raw.experience, 0, 999999999, 0);
  normalized.equipmentLoad = raw.equipmentLoad === "" || raw.equipmentLoad == null ? null : clampNumber(raw.equipmentLoad, 0, 99999, 0);
  normalized.carryingCapacity = raw.carryingCapacity === "" || raw.carryingCapacity == null ? null : clampNumber(raw.carryingCapacity, 0, 99999, 0);
  normalized.currentHp = clampInteger(raw.currentHp, 0, 99999, 0);
  normalized.tempHp = clampInteger(raw.tempHp, 0, 99999, 0);
  normalized.hitDiceCurrent = clampInteger(raw.hitDiceCurrent, 0, 20, 1);
  normalized.resourceSpent = Object.fromEntries(Object.entries(raw.resourceSpent || {}).filter(([k])=>/^[a-zA-Z]+$/.test(k)).map(([k,v])=>[k,clampInteger(v,0,9999,0)]));
  normalized.concentrationSpellId = typeof raw.concentrationSpellId === 'string' ? raw.concentrationSpellId : null;
  normalized.attacks = normalizeRecords(raw.attacks, normalizeAttack);
  normalized.spells = normalizeRecords(raw.spells, normalizeSpell);
  normalized.spellSlots = normalizeSpellSlots(raw.spellSlots);
  normalized.deployedCreatures = normalizeRecords(raw.deployedCreatures, normalizeCreature);
  normalized.inventory = normalizeRecords(raw.inventory, normalizeInventoryItem);
  normalized.ledger = normalizeRecords(raw.ledger, normalizeLedgerEntry);
  normalized.currency = normalizeCurrency(raw.currency);
  normalized.ruleset = RULESETS[raw.ruleset] ? raw.ruleset : "dnd5r-2024";
  normalized.classId = CLASSES[raw.classId] ? raw.classId : "bard";
  normalized.armorId = ARMORS[raw.armorId] ? raw.armorId : "unarmored";
  normalized.level = clampInteger(raw.level, 1, 20, 1);
  normalized.hitDiceCurrent = Math.min(normalized.hitDiceCurrent, totalLevel(normalized));
  if (!raw.pactSlots && normalized.classId === "warlock" && !normalized.multiclasses.length) {
    const rank = Math.min(5, Math.ceil(normalized.level / 2));
    normalized.pactSlots = { level: rank, ...normalized.spellSlots[rank] };
    normalized.spellSlots = normalizeSpellSlots({});
  }
  normalized.speed = clampInteger(raw.speed, 0, 200, 30);
  normalized.shield = Boolean(raw.shield);
  normalized.armorBonus = clampInteger(raw.armorBonus, -5, 10, 0);
  normalized.armorProperty = String(raw.armorProperty ?? "").slice(0, 500);
  normalized.shieldName = String(raw.shieldName ?? "").slice(0, 160);
  normalized.shieldAttuned = normalizeBoolean(raw.shieldAttuned);
  normalized.shieldAcBonus = clampInteger(raw.shieldAcBonus, 0, 10, 2);
  normalized.weaponAttackAbility = raw.weaponAttackAbility === "str" ? "str" : "dex";
  normalized.ammunitionName = String(raw.ammunitionName ?? "").slice(0, 60);
  normalized.ammunitionCount = clampInteger(raw.ammunitionCount, 0, 99999, 0);
  normalized.weapons = normalizeWeapons(raw);
  normalized.curios = normalizeCurios(raw);
  for (const { attunementField } of EQUIPMENT_SLOTS) normalized[attunementField] = normalizeBoolean(raw[attunementField]);
  for (const ability of Object.keys(ABILITIES)) normalized.abilities[ability] = clampInteger(raw.abilities?.[ability], 1, 30, 10);
  for (const skill of Object.keys(SKILLS)) normalized.skills[skill] = clampInteger(raw.skills?.[skill], 0, 2, 0);
  normalized.updatedAt = new Date().toISOString();
  syncHitDice(normalized);
  return normalized;
}

export function validateCharacter(character) {
  if(isCoc(character))return validateCoc(character);
  const issues = [];
  const effects=characterEffects(character);
  if(hitDiceState(character).pending) issues.push(issue('runtimeControls','旧卡生命骰需分配到各职业，暂不允许自动扣骰。','warning'));
  for(const message of effects.skillGrants.issues) issues.push(issue('skillGrantChoices',message,'warning'));
  for(const message of effects.advancement.issues) issues.push(issue('advancementChoices',message,'warning'));
  for(const message of effects.proficiencyGrants.issues) issues.push(issue('proficiencyGrantChoices',message,'warning'));
  for (const message of multiclassIssues({ ...character, abilities: effects.abilities })) issues.push(issue("multiclassRows", message, /超过 20|重复添加/.test(message) ? "error" : "warning"));
  if (!character.name.trim()) issues.push(issue("name", "角色需要一个名字。", "error"));
  if (!RULESETS[character.ruleset]) issues.push(issue("ruleset", "无法识别规则版本。", "error"));
  if (!CLASSES[character.classId]) issues.push(issue("classId", "无法识别职业。", "error"));
  if (!Number.isInteger(character.level) || character.level < 1 || character.level > 20) issues.push(issue("level", "等级必须在 1 到 20 之间。", "error"));
  for (const [ability, label] of Object.entries(ABILITIES)) {
    const score = character.abilities[ability];
    if (!Number.isInteger(score) || score < 1 || score > 30) issues.push(issue(`ability-${ability}`, `${label}必须在 1 到 30 之间。`, "error"));
    else if (score > 20) issues.push(issue(`ability-${ability}`, `${label}超过常规上限 20；请确认有对应规则来源。`, "warning"));
  }
  for (const [skill, rank] of Object.entries(character.skills)) {
    if (rank === 2 && character.level < 1) issues.push(issue(`skill-${skill}`, "专精需要有效角色等级。", "error"));
  }
  const attunedCount = getAttunedEquipment(character).length;
  const mechanics=classMechanics(character,effects.abilities);
  if (attunedCount > mechanics.attunementLimit) issues.push(issue("attunementCount", `已选择 ${attunedCount} 件同调物品，超过当前上限 ${mechanics.attunementLimit}。`, "warning"));
  for(const capacity of spellCapacity(character)) if(capacity.over) issues.push(issue('spellCapacitySummary',`${CLASSES[capacity.classId].name}${capacity.mode}法术 ${capacity.count} 个，超过 ${capacity.limit} 个上限。`,'warning'));
  for(const f of effects.activations.filter(a=>!a.active&&a.feature.effectMode!=='off')) issues.push(issue('effectSummary',`${f.feature.name}未应用：${f.reason}`,'warning'));
  if(loadSummary(character).over) issues.push(issue('carryingCapacity','已记录重量超过载重上限。','warning'));
  return issues;
}

export function getAttunedEquipment(character) {
  const items = [];
  if (normalizeBoolean(character?.equipmentArmorAttuned)) items.push({ field: "equipmentArmor", label: "护甲", name: String(character?.equipmentArmor || ARMORS[character?.armorId]?.name || "").trim() });
  normalizeWeapons(character ?? {}).forEach((weapon, index) => {
    if (weapon.attuned) items.push({ field: `weapons.${index}`, label: `武器 ${index + 1}`, name: weapon.name || weapon.weaponType });
  });
  if (normalizeBoolean(character?.shieldAttuned)) items.push({ field: "shieldName", label: "盾牌", name: String(character?.shieldName ?? "").trim() });
  normalizeCurios(character ?? {}).forEach((curio, index) => {
    if (curio.attuned) items.push({ field: `curios.${index}`, label: curio.slot || `奇物 ${index + 1}`, name: curio.name });
  });
  return items;
}

export function deriveMvpCharacter(character) {
  if(isCoc(character))throw new TypeError('CoC 必须使用独立派生计算器');
  const effects = characterEffects(character);
  const definition = CLASSES[character.classId];
  const safeLevel = clampInteger(character.level, 1, 20, 1);
  const safeAbilities = Object.fromEntries(
    Object.keys(ABILITIES).map((ability) => [ability, clampInteger(effects.abilities[ability], 1, 30, 10)]),
  );
  const skillInput = Object.fromEntries(
    Object.entries(SKILLS).map(([id, skill]) => [id, {
      ability: skill.ability,
      proficient: effects.skillGrants.ranks[id] >= 1,
      expertise: effects.skillGrants.ranks[id] === 2,
    }]),
  );
  const input = {
    ruleset: character.ruleset,
    classes: characterClasses(character).map((c) => ({ ...c, level: clampInteger(c.level, 1, 20, 1) })),
    abilities: safeAbilities,
    proficiencies: { savingThrows: effects.advancement.savingThrows },
    skills: skillInput,
    equipment: {
      armor: { id: character.armorId, ...ARMORS[character.armorId] },
      shield: character.shield,
    },
    spellcasting: definition.casting ? { ability: definition.casting, dcBonus: 0, attackBonus: 0 } : null,
    adjustments: { armorClass: [clampInteger(character.armorBonus, -5, 10, 0), character.shield ? clampInteger(character.shieldAcBonus, 0, 10, 2) - 2 : 0], hitPoints: [], savingThrows: {}, initiative: 0 },
  };
  // Keep the preview usable while an invalid imported/editing total is being corrected.
  let remaining = 20;
  input.classes = input.classes.map((c) => { const level = Math.min(c.level, remaining); remaining -= level; return { ...c, level }; }).filter((c) => c.level > 0);
  const casters = spellProgression(character).classes.filter((c) => c.kind !== "none");
  const caster = casters.find((c) => c.classId === character.spellcastingClassId) || casters[0];
  input.spellcasting = caster?.ability ? { ability: caster.ability, dcBonus: 0, attackBonus: 0 } : null;
  const derived = deriveCharacter(input, ADAPTERS[character.ruleset]);
  derived.hitPoints += effects.hpBonus;
  derived.initiative += effects.initiativeBonus;
  const mechanics=classMechanics(character,safeAbilities);
  derived.hitPoints+=mechanics.hpBonus;
  if(mechanics.hpBonus) effects.trace.push(`龙族体魄：最大生命值 +${mechanics.hpBonus}（术士等级）`);
  for(const defense of mechanics.defenses) {
    if(defense.ac>derived.armorClass) { derived.armorClass=defense.ac;effects.trace.push(`${defense.name}：AC ${defense.ac}`); }
  }
  derived.armorClass += effects.defenseBonus;
  for(const id of Object.keys(ABILITIES)) derived.savingThrows[id]+=effects.fill.bonuses['save:'+id];
  for(const id of Object.keys(SKILLS)) derived.skills[id]+=effects.fill.bonuses['skill:'+id];
  if(derived.spellcasting) {
    derived.spellcasting.saveDc+=effects.fill.bonuses.spellDc;
    derived.spellcasting.attackBonus+=effects.fill.bonuses.spellAttack;
  }
  if(mechanics.jack) {
    const half=Math.floor(derived.proficiencyBonus/2);
    for(const [id,input] of Object.entries(skillInput)) if(!input.proficient&&!input.expertise) derived.skills[id]+=half;
    if(mechanics.jackInitiative) derived.initiative+=half;
    effects.trace.push(`万事通：未熟练技能 +${half}${mechanics.jackInitiative?'，先攻亦适用':''}`);
  }
  effects.trace.push(`攻击动作 ${mechanics.attacks} 次攻击；职业基础专精名额 ${mechanics.expertise}（在熟练与专精选择中分配）`);
  return {
    ...derived,
    deathSaveBonus: effects.advancement.deathProficient ? derived.proficiencyBonus : 0,
    effects,
    mechanics,
    spellCapacity: spellCapacity(character),
    load: loadSummary(character),
    passivePerception: 10 + derived.skills.perception,
    speed: Math.max(0,Number(character.speed)+effects.fill.bonuses.speed),
    classDefinition: definition,
    castingAbility: caster?.ability || null,
    castingClassId: caster?.classId || "other",
    classLevels: characterClasses(character),
    hitDiceLabel: Object.entries(characterClasses(character).reduce((groups, c) => { const die = CLASSES[c.classId]?.hitDie || 8; groups[die] = (groups[die] || 0) + c.level; return groups; }, {})).map(([die, n]) => `${n}d${die}`).join(" + "),
    rulesetDefinition: RULESETS[character.ruleset],
  };
}

export function buildTrace(character, derived, key) {
  return buildCalculationTrace(character, derived, key);
}

export function exportDocument(character) {
  return {
    format: "dnd-character-studio/character",
    version: 1,
    exportedAt: new Date().toISOString(),
    character: normalizeCharacter(character),
  };
}

export function importDocument(document) {
  if (document?.format === "dnd-character-studio/character") return normalizeCharacter(document.character);
  return normalizeCharacter(document);
}

export function signed(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function issue(field, message, severity) {
  return { id: `${field}:${message}`, field, message, severity };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeRecords(value, normalizer) {
  return Array.isArray(value) ? value.slice(0, 200).map(normalizer) : [];
}

function normalizeWeapons(raw) {
  // Explicit arrays (including an intentionally empty list) retain their size.
  if (Array.isArray(raw.weapons)) return raw.weapons.slice(0, 200).map(normalizeWeapon);
  const legacyNames = [raw.equipmentRightHand ?? raw.combatPrimaryEquipment, raw.equipmentLeftHand ?? raw.combatOffhandEquipment, raw.equipmentTwoHand ?? raw.combatBackupEquipment];
  const legacyFlags = [raw.equipmentRightHandAttuned, raw.equipmentLeftHandAttuned, raw.equipmentTwoHandAttuned];
  const count = Math.min(200, Math.max(WEAPON_ROW_COUNT, legacyNames.findLastIndex((name, i) => name || legacyFlags[i]) + 1, raw.attacks?.length || 0));
  return Array.from({ length: count }, (_, index) => {
    const oldAttack = Array.isArray(raw.attacks) ? raw.attacks[index] : null;
    return normalizeWeapon({
      name: legacyNames[index] || oldAttack?.name || "",
      attuned: legacyFlags[index],
      attackDie: oldAttack ? `d20 ${oldAttack.attackBonus >= 0 ? "+" : ""}${oldAttack.attackBonus || 0}` : "",
      damageDie: oldAttack?.damage ?? "",
      damageType: oldAttack?.damageType ?? "",
      effect: oldAttack?.notes ?? "",
    });
  });
}

export function normalizeWeapon(value = {}) {
  if (!value || typeof value !== "object") value = {};
  const fields = ["weaponType", "name", "properties", "attackDie", "damageDie", "damageType", "extraDamageDie", "extraDamageType", "mastery", "effect", "catalogType"];
  const weapon = Object.fromEntries(fields.map((field) => [field, String(value[field] ?? "").slice(0, field === "effect" ? 500 : 160)]));
  const catalogDefaults = Object.fromEntries(["properties", "damageDie", "damageType", "mastery"]
    .map((field) => [field, String(value.catalogDefaults?.[field] ?? "").slice(0, 160)]));
  return { ...weapon, catalogDefaults, bonus: clampInteger(value.bonus, -10, 20, 0), proficient: normalizeBoolean(value.proficient), attuned: normalizeBoolean(value.attuned),
    ability: Object.hasOwn(ABILITIES,value.ability)?value.ability:'',
    attackMode: value.attackMode==='manual'||(!value.attackMode&&weapon.attackDie&&!/^d20$/i.test(weapon.attackDie.trim()))?'manual':'auto',
    proficiencyMode:value.proficiencyMode==='manual'?'manual':'auto' };
}

function normalizeCurios(raw) {
  const legacy = EQUIPMENT_SLOTS.slice(4);
  return Array.from({ length: CURIO_ROW_COUNT }, (_, index) => {
    const item = Array.isArray(raw.curios) ? raw.curios[index] : null;
    const old = legacy[index];
    const value = item ?? { name: raw[old.field] ?? "", attuned: raw[old.attunementField], slot: raw[old.field] ? old.label : "" };
    return { name: String(value?.name ?? "").slice(0, 160), attuned: normalizeBoolean(value?.attuned), rarity: String(value?.rarity ?? "").slice(0, 40), slot: String(value?.slot ?? "").slice(0, 50), properties: String(value?.properties ?? "").slice(0, 500) };
  });
}

function normalizeFeatureEntry(value = {}) {
  const kinds = new Set(["class", "species", "feat", "fighting", "special"]);
  return {
    id: safeRecordId(value.id),
    kind: kinds.has(value.kind) ? value.kind : "special",
    level: clampInteger(value.level, 0, 20, 0),
    name: String(value.name ?? "").slice(0, 120),
    description: String(value.description ?? "").slice(0, 3000),
    current: clampInteger(value.current, 0, 9999, 0),
    maximum: clampInteger(value.maximum, 0, 9999, 0),
    recovery: String(value.recovery ?? "").slice(0, 40),
    catalogEntry: value.catalogEntry && typeof value.catalogEntry === "object" ? JSON.parse(JSON.stringify(value.catalogEntry)) : null,
    effectMode: ['off','confirmed','manual'].includes(value.effectMode)?value.effectMode:'auto',
    fillEffects: normalizeFillEffects(value.fillEffects),
    advancementSource: String(value.advancementSource||'').slice(0,100),
    speciesBinding: String(value.speciesBinding||'').slice(0,400),
    speciesSourceId: String(value.speciesSourceId||'').slice(0,200),
    sourceRuleset: ['dnd5e-2014','dnd5r-2024'].includes(value.sourceRuleset)?value.sourceRuleset:'',
    sourceNote: String(value.sourceNote||'').slice(0,160),
  };
}

function normalizeSpell(value = {}) {
  const legacySource = String(value.source ?? "");
  return {
    id: safeRecordId(value.id),
    name: String(value.name ?? "").slice(0, 120),
    level: clampInteger(value.level, 0, 9, 0),
    customRank: Boolean(value.customRank),
    castingClassId: String(value.castingClassId || ""),
    prepared: Boolean(value.prepared ?? (legacySource === "准备")),
    alwaysPrepared: Boolean(value.alwaysPrepared),
    source: (legacySource === "准备" ? "" : legacySource).slice(0, 160),
    classes: String(value.classes ?? "").slice(0, 240),
    school: String(value.school ?? "").slice(0, 40),
    ritual: Boolean(value.ritual),
    concentration: Boolean(value.concentration),
    castingTime: String(value.castingTime ?? "").slice(0, 80),
    range: String(value.range ?? "").slice(0, 80),
    duration: String(value.duration ?? "").slice(0, 100),
    verbal: Boolean(value.verbal),
    somatic: Boolean(value.somatic),
    materialComponent: Boolean(value.materialComponent),
    material: String(value.material ?? "").slice(0, 500),
    effect: String(value.effect ?? value.notes ?? "").slice(0, 2000),
  };
}

export function orderSpellsForBook(spells) {
  return spells.map((spell, index) => ({ spell, index })).sort((a, b) =>
    Number(Boolean(b.spell.prepared)) - Number(Boolean(a.spell.prepared))
    || Number(a.spell.level) - Number(b.spell.level)
    || a.index - b.index
  ).map(({ spell }) => spell);
}

function normalizeAttack(value = {}) {
  return {
    id: safeRecordId(value.id),
    name: String(value.name ?? "").slice(0, 120),
    ability: String(value.ability ?? "力量").slice(0, 20),
    attackBonus: clampNumber(value.attackBonus, -99, 99, 0),
    damage: String(value.damage ?? "").slice(0, 80),
    damageType: String(value.damageType ?? "").slice(0, 60),
    notes: String(value.notes ?? "").slice(0, 500),
  };
}

function normalizeCreature(value = {}) {
  return {
    portrait: typeof value.portrait === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value.portrait) ? value.portrait.slice(0, 1_800_000) : '',
    id: safeRecordId(value.id),
    name: String(value.name ?? "").slice(0, 120),
    type: String(value.type ?? "").slice(0, 80),
    sex: String(value.sex ?? "").slice(0, 40),
    species: String(value.species ?? "").slice(0, 80),
    alignment: String(value.alignment ?? "").slice(0, 60),
    size: String(value.size ?? "中型").slice(0, 20),
    catalogDefaults: value.catalogDefaults && typeof value.catalogDefaults==='object' ? JSON.parse(JSON.stringify(value.catalogDefaults)) : null,
    challengeRating: String(value.challengeRating ?? "").slice(0, 30),
    proficiencyBonus: clampNumber(value.proficiencyBonus, -20, 20, 2),
    armorClass: clampInteger(value.armorClass, 0, 99, 10),
    hitPoints: clampInteger(value.hitPoints, 0, 9999, 1),
    currentHitPoints: clampInteger(value.currentHitPoints ?? value.hitPoints, 0, 9999, 1),
    tempHitPoints: clampInteger(value.tempHitPoints, 0, 9999, 0),
    hitDice: String(value.hitDice ?? "").slice(0, 60),
    initiative: clampNumber(value.initiative, -30, 30, 0),
    speed: String(value.speed ?? "").slice(0, 120),
    abilities: Object.fromEntries(Object.keys(ABILITIES).map((ability) => [ability, clampInteger(value.abilities?.[ability], 1, 30, 10)])),
    skills: String(value.skills ?? "").slice(0, 1000),
    resistances: String(value.resistances ?? "").slice(0, 1000),
    immunities: String(value.immunities ?? "").slice(0, 1000),
    senses: String(value.senses ?? "").slice(0, 1000),
    languages: String(value.languages ?? "").slice(0, 1000),
    actions: String(value.actions ?? "").slice(0, 3000),
    traits: String(value.traits ?? "").slice(0, 3000),
    notes: String(value.notes ?? "").slice(0, 1000),
  };
}

function normalizeInventoryItem(value = {}) {
  return {
    id: safeRecordId(value.id),
    name: String(value.name ?? "").slice(0, 120),
    section: ["quick", "self", "container"].includes(value.section) ? value.section : "quick",
    description: String(value.description ?? value.notes ?? "").slice(0, 1000),
    quantity: clampInteger(value.quantity, 0, 9999, 1),
    weight: clampNumber(value.weight, 0, 9999, 0),
  };
}

function normalizeLedgerEntry(value = {}) {
  return {
    id: safeRecordId(value.id),
    kind: value.kind === "expense" ? "expense" : "income",
    project: String(value.project ?? "").slice(0, 120),
    detail: String(value.detail ?? "").slice(0, 500),
    amount: clampNumber(value.amount, 0, 999999999, 0),
  };
}

function defaultSpellSlots() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), { current: 0, maximum: 0 }]));
}

function normalizeSpellSlots(value = {}) {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const level = String(index + 1);
    return [level, { current: clampInteger(value?.[level]?.current, 0, 99, 0), maximum: clampInteger(value?.[level]?.maximum, 0, 99, 0) }];
  }));
}

function normalizeCurrency(value = {}) {
  return Object.fromEntries(["cp", "sp", "ep", "gp", "pp"].map((coin) => [coin, clampInteger(value?.[coin], 0, 999999999, 0)]));
}

function safeRecordId(value) {
  const candidate = String(value ?? "").slice(0, 120);
  return candidate || createId();
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
