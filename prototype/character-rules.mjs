import { CLASSES, ABILITIES } from "./content.mjs";
import { FULL_CASTER_SLOTS } from "../packages/rules-5e-2014/spell-slots.mjs";

export const CLASS_ALIASES = { 魔契师: "warlock", 魔契士: "warlock", 契术师: "warlock", 盗贼: "rogue", 奇械师: "artificer", 奇械工匠: "artificer" };
export function classIdForName(name) {
  const value = String(name || "").trim();
  return CLASSES[value] ? value : CLASS_ALIASES[value] || Object.keys(CLASSES).find((id) => CLASSES[id].name === value) || "";
}
export function characterClasses(character) {
  return [{ classId: character.classId, level: Number(character.level) || 1, subclass: character.subclass || "" },
    ...(character.multiclasses || []).map((item) => ({ classId: item.classId, level: Number(item.level) || 1, subclass: item.subclass || "" }))];
}
export function totalLevel(character) { return characterClasses(character).reduce((sum, item) => sum + item.level, 0); }
export function parseLegacyMulticlass(text) {
  if (!String(text || "").trim()) return { classes: [], unresolved: "" };
  const classes = [];
  const unresolved = [];
  for (const token of String(text).split(/[，,、/／+＋;；\n]+/).filter((s) => s.trim())) {
    const match = token.trim().match(/^([^\d]+?)\s*(\d{1,2})\s*级?$/) || token.trim().match(/^(\d{1,2})\s*级?\s*(.+)$/)?.map((s, i, a) => i === 1 ? a[2] : i === 2 ? a[1] : s);
    const id = match && classIdForName(match[1]);
    if (id && Number(match[2]) >= 1 && Number(match[2]) <= 20 && !classes.some((c) => c.classId === id)) classes.push({ classId: id, level: Number(match[2]), subclass: "" });
    else unresolved.push(token.trim());
  }
  return { classes, unresolved: unresolved.join("；") };
}

export function castingKind(item, ruleset) {
  if (["bard", "cleric", "druid", "sorcerer", "wizard"].includes(item.classId)) return "full";
  if (item.classId === "warlock") return "pact";
  if (item.classId === "artificer") return "halfUp";
  if (["paladin", "ranger"].includes(item.classId)) return ruleset === "dnd5r-2024" || item.level >= 2 ? "half" : "none";
  if (item.level >= 3 && ((item.classId === "fighter" && /奥法骑士|Eldritch Knight/i.test(item.subclass)) || (item.classId === "rogue" && /诡术师|Arcane Trickster/i.test(item.subclass)))) return "third";
  return "none";
}
function slotRow(level) { return Array.from({ length: 9 }, (_, i) => FULL_CASTER_SLOTS[Math.min(20, level) - 1]?.[i] || 0); }
export function singleClassSlots(item, ruleset) {
  const kind = castingKind(item, ruleset);
  if (kind === "full") return slotRow(item.level);
  if (["half", "halfUp"].includes(kind)) return slotRow(Math.ceil(item.level / 2)).map((v, i) => i < 5 ? v : 0);
  if (kind === "third") return slotRow(Math.ceil(item.level / 3)).map((v, i) => i < 4 ? v : 0);
  if (kind === "pact") return Array.from({ length: 9 }, (_, i) => i === Math.min(5, Math.ceil(item.level / 2)) - 1 ? item.level === 1 ? 1 : item.level < 11 ? 2 : item.level < 17 ? 3 : 4 : 0);
  return Array(9).fill(0);
}
export function spellProgression(character) {
  const classes = characterClasses(character);
  const casters = classes.filter((c) => !["none", "pact"].includes(castingKind(c, character.ruleset)));
  let casterLevel = 0;
  for (const c of casters) {
    const kind = castingKind(c, character.ruleset);
    casterLevel += kind === "full" ? c.level : kind === "third" ? Math.floor(c.level / 3)
      : kind === "halfUp" || character.ruleset === "dnd5r-2024" ? Math.ceil(c.level / 2) : Math.floor(c.level / 2);
  }
  const warlock = classes.find((c) => c.classId === "warlock");
  const pactLevel = warlock ? Math.min(5, Math.ceil(warlock.level / 2)) : 0;
  return { casterLevel, slots: casters.length === 1 ? singleClassSlots(casters[0], character.ruleset) : slotRow(casterLevel),
    pact: { level: pactLevel, maximum: warlock ? singleClassSlots(warlock, character.ruleset)[pactLevel - 1] : 0 },
    classes: classes.map((c) => ({ ...c, kind: castingKind(c, character.ruleset), maxRank: singleClassSlots(c, character.ruleset).findLastIndex((n) => n > 0) + 1,
      ability: castingKind(c, character.ruleset) === "third" ? "int" : CLASSES[c.classId]?.casting || null })) };
}
export function syncCharacterSlots(character, { preserveSpent = true } = {}) {
  if (totalLevel(character) > 20 || character.multiclassUnresolved) return false;
  const progression = spellProgression(character);
  character.spellSlots ||= {};
  for (let rank = 1; rank <= 9; rank++) {
    const old = character.spellSlots[rank] || {};
    const spent = preserveSpent ? Math.max(0, (old.maximum || 0) - (old.current || 0)) : 0;
    const maximum = progression.slots[rank - 1];
    character.spellSlots[rank] = { current: Math.max(0, maximum - spent), maximum };
  }
  const old = character.pactSlots || {};
  const spent = preserveSpent ? Math.max(0, (old.maximum || 0) - (old.current || 0)) : 0;
  character.pactSlots = { ...progression.pact, current: Math.max(0, progression.pact.maximum - spent) };
  return true;
}
export function multiclassIssues(character) {
  const classes = characterClasses(character), issues = [];
  if (totalLevel(character) > 20) issues.push("各职业等级合计不能超过 20。");
  if (new Set(classes.map((c) => c.classId)).size !== classes.length) issues.push("同一职业请合并等级，不要重复添加。");
  if (character.multiclassUnresolved) issues.push(`原兼职备注尚未识别：${character.multiclassUnresolved}`);
  if (classes.length < 2) return issues;
  const requirements = { barbarian: [["str"]], bard: [["cha"]], cleric: [["wis"]], druid: [["wis"]], fighter: [["str", "dex"]], monk: [["dex"], ["wis"]], paladin: [["str"], ["cha"]], ranger: [["dex"], ["wis"]], rogue: [["dex"]], sorcerer: [["cha"]], warlock: [["cha"]], wizard: [["int"]], artificer: [["int"]] };
  for (const c of classes) for (const alternatives of requirements[c.classId] || []) {
    if (!alternatives.some((a) => Number(character.abilities?.[a]) >= 13)) issues.push(`${CLASSES[c.classId]?.name}兼职要求${alternatives.map((a) => ABILITIES[a]).join("或")}至少 13。`);
  }
  return issues;
}

export function spellClassNames(character, classId) {
  if (classId === "other") return null;
  const item = characterClasses(character).find((c) => c.classId === classId);
  if (!item) return [];
  let ids = [castingKind(item, character.ruleset) === "third" ? "wizard" : item.classId];
  if (item.classId === "sorcerer" && /神魂|神圣之魂/.test(item.subclass)) ids.push("cleric");
  if (item.classId === "bard" && character.ruleset === "dnd5r-2024" && item.level >= 10) ids.push("cleric", "druid", "wizard");
  return [...new Set(ids.flatMap((id) => [CLASSES[id]?.name, ...Object.keys(CLASS_ALIASES).filter((n) => CLASS_ALIASES[n] === id)]).filter(Boolean))];
}

export function prerequisiteText(description) {
  return String(description || "").match(/(?:^|\n|[（(])\s*(?:先决(?:条件)?|前提(?:条件)?|Prerequisites?)\s*[:：；]\s*([^\n）)]+)/i)?.[1]?.trim() || "";
}
export function trainedArmor(character) {
  const armor = [String(character.armorTraining || "")];
  for (const [index, c] of characterClasses(character).entries()) {
    if (["barbarian", "cleric", "fighter", "paladin", "ranger", "artificer"].includes(c.classId) || (c.classId === "druid" && character.ruleset === "dnd5e-2014")) armor.push("轻甲 中甲 盾牌");
    else if (["bard", "rogue", "warlock", "druid"].includes(c.classId)) armor.push(c.classId === 'druid' ? "轻甲 盾牌" : "轻甲");
    if (index === 0 && ["fighter", "paladin"].includes(c.classId)) armor.push("重甲");
  }
  return armor.join(" ");
}
export function entryEligibility(entry, character, { featureKind, castingClassId } = {}) {
  const p = entry.payload || {}, link = p.规则关联 || {}, classes = characterClasses(character);
  const failures = [], review = [];
  if(entry.ruleset&&entry.ruleset!==character.ruleset) failures.push('资料规则版本不同');
  if(entry.kind==='species_feature') {
    if(link.species && character.species!==link.species) failures.push(`需要种族：${link.species}`);
    if(link.subrace && character.subrace!==link.subrace) failures.push(`需要亚种：${link.subrace}`);
  }
  if (link.isMisclassified) failures.push('来源区域不是职业能力表，已排除此误读条目');
  const classId = classIdForName(link.className || p.职业);
  const ownedClass = classes.find((c) => c.classId === classId);
  if (entry.kind === "spell" && castingClassId && castingClassId !== "other") {
    const names = spellClassNames(character, castingClassId) || [];
    if (!(p.职业列表 || []).some((n) => names.includes(String(n).trim()))) failures.push("不在该职业法术表中");
    const caster = spellProgression(character).classes.find((c) => c.classId === castingClassId);
    if (!caster || caster.kind === "none" || Number(entry.rank) > caster.maxRank) failures.push("超过该职业当前可学环阶");
  }
  if (entry.kind === "class_feature") {
    if (!ownedClass) failures.push(`需要${link.className || p.职业}`);
    else {
      if (link.subclass && ownedClass.subclass !== link.subclass) failures.push(`需要子职：${link.subclass}`);
      if (link.minLevel && ownedClass.level < link.minLevel) failures.push(`需要${CLASSES[classId].name} ${link.minLevel} 级`);
      if (!link.minLevel) review.push("原表未明确获得等级");
    }
  }
  if (featureKind === "fighting" && p.分类 !== "战斗风格") failures.push("不是战斗风格");
  if (featureKind === "feat" && p.分类 === "战斗风格") failures.push("请在战斗风格栏选择此条目");
  if (p.分类 === "战斗风格") {
    if (Array.isArray(link.allowedClasses) && !classes.some(c => link.allowedClasses.some(n => classIdForName(n) === c.classId)) && !character.featureEntries?.some(f=>/战斗学徒|武技训练/.test(f.name))) failures.push('不在当前职业的战斗风格选项中');
    const fighter = classes.some((c) => c.classId === "fighter" && c.level >= 1);
    const paladin = classes.some((c) => c.classId === "paladin" && c.level >= 2);
    const ranger = classes.some((c) => c.classId === "ranger" && c.level >= 2);
    if (!fighter && !paladin && !ranger && !character.featureEntries?.some((f) => f.kind !== 'fighting' && /战斗学徒|战斗风格|武技训练/.test(f.name) && (!f.catalogEntry?.ruleset || f.catalogEntry.ruleset === character.ruleset))) failures.push("需要战斗风格特性");
    if (/受祝福的勇士/.test(entry.name) && !paladin) failures.push("需要圣武士 2 级");
    if (/德鲁伊教战士/.test(entry.name) && !ranger) failures.push("需要游侠 2 级");
  }
  if (entry.kind === "feature_option") {
    const required = /祈唤/.test(p.分类) ? "warlock" : /超魔/.test(p.分类) ? "sorcerer" : /注法/.test(p.分类) ? "artificer" : /四象/.test(p.分类) ? "monk" : /战技|符文|奥术射击/.test(p.分类) ? "fighter" : "";
    const grants = { warlock: /魔能学徒|魔能导师/, sorcerer: /超魔学徒|超魔法导师/, fighter: /战斗学徒|武技训练/ };
    const granted = grants[required] && character.featureEntries?.some((f) => grants[required].test(f.name));
    const owner = classes.find((c) => c.classId === required);
    if (required && !owner && !granted) failures.push(`需要${CLASSES[required].name}或对应授予能力`);
    const subclass = /战技/.test(p.分类) ? /战斗大师/ : /符文/.test(p.分类) ? /符文骑士/ : /奥术射击/.test(p.分类) ? /奥术射手|奥法射手/ : /四象/.test(p.分类) ? /四象/ : null;
    if (owner && subclass && !subclass.test(owner.subclass) && !(/战技/.test(p.分类) && granted)) failures.push("需要对应子职业或明确的能力来源");
  }
  const prerequisite = prerequisiteText(p.描述);
  const abilities = Object.entries(ABILITIES);
  for (const clause of prerequisite.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean)) {
    let handled = false;
    // Only evaluate recognized clauses. Compound homebrew prerequisites remain visible for review.
    if (/(?:专长|背景|成员|战役|不具有|没有)/.test(clause)) { review.push(clause); continue; }
    const score = clause.match(/(\d+)\s*(?:\+|或更高|以上|及以上)?/);
    const mentioned = abilities.filter(([, name]) => clause.includes(name));
    if (mentioned.length && score && !/级/.test(clause) && /^(?:力量|敏捷|体质|智力|感知|魅力|或|者|与|和|、|为|至少|达到|\d|\s|\+|以上|及以上|更高)+$/.test(clause)) {
      const matches = mentioned.map(([id]) => Number(character.abilities?.[id]) >= Number(score[1]));
      if (!(clause.includes("或") ? matches.some(Boolean) : matches.every(Boolean))) failures.push(`需要${clause}`);
      handled = true;
    }
    const levelMatch = clause.match(/(?:第\s*)?(\d+)\s*级|等级\s*(\d+)/);
    if (levelMatch && !/特性|且|并/.test(clause)) {
      const requiredClass = Object.keys(CLASSES).find((id) => clause.includes(CLASSES[id].name)) || (clause.includes("魔契师") ? "warlock" : "");
      const owner = requiredClass || (entry.kind === "feature_option" && /祈唤/.test(p.分类) ? "warlock" : "");
      const current = owner ? classes.find((c) => c.classId === owner)?.level || 0 : totalLevel(character);
      if (current < Number(levelMatch[1] || levelMatch[2])) failures.push(`需要${clause}`);
      handled = true;
    }
    const namedClass = classIdForName(clause.replace(/职业$/, ""));
    if (namedClass) { if (!classes.some((c) => c.classId === namedClass)) failures.push(`需要${clause}`); handled = true; }
    if (/^(?:施法(?:或契约魔法)?特性|契约魔法特性|至少可以施展一个法术)$/.test(clause)) {
      const canCast = spellProgression(character).classes.some((c) => c.kind !== "none");
      if (!canCast && !(/至少/.test(clause) && character.spells?.some((s) => s.name?.trim()))) failures.push(`需要${clause}`);
      handled = true;
    }
    if (/^(?:轻甲|中甲|重甲)(?:熟练项?|受训|训练)$/.test(clause)) {
      const armor = clause.slice(0, 2);
      if (!trainedArmor(character).includes(armor)) failures.push(`需要${clause}`);
      handled = true;
    }
    if (/^(?:精灵|半精灵|矮人|半身人|侏儒|人类|半兽人|提夫林|龙裔)(?:或者?(?:精灵|半精灵|矮人|半身人|侏儒|人类|半兽人|提夫林|龙裔))*$/.test(clause)) {
      if (!clause.split(/或者?/).some((s) => `${character.species} ${character.subrace}`.includes(s))) failures.push(`需要${clause}`);
      handled = true;
    }
    if (/^[链刃书符]之魔契$/.test(clause)) {
      if (!character.featureEntries?.some((f) => f.name.includes(clause))) failures.push(`需要${clause}`);
      handled = true;
    }
    if (!handled) review.push(clause);
  }
  return { status: failures.length ? "blocked" : review.length ? "review" : "eligible", failures, review, prerequisite };
}
