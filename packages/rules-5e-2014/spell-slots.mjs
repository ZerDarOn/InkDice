// D&D Basic Rules (2014), class progression tables:
// https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes
export const FULL_CASTER_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTERS = new Set(["paladin", "ranger"]);

export function get5eSpellSlotProgression(classId, level) {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new RangeError("5E level must be 1–20");
  const slots = Array(9).fill(0);
  if (FULL_CASTERS.has(classId)) {
    FULL_CASTER_SLOTS[level - 1].forEach((count, index) => { slots[index] = count; });
    return { kind: "spellcasting", recovery: "长休", slots };
  }
  if (HALF_CASTERS.has(classId)) {
    if (level >= 2) FULL_CASTER_SLOTS[Math.ceil(level / 2) - 1].slice(0, 5).forEach((count, index) => { slots[index] = count; });
    return { kind: "spellcasting", recovery: "长休", slots };
  }
  if (classId === "warlock") {
    const slotLevel = Math.min(5, Math.ceil(level / 2));
    const count = level === 1 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4;
    slots[slotLevel - 1] = count;
    return { kind: "pact", recovery: "短休或长休", slots };
  }
  if (["barbarian", "fighter", "monk", "rogue"].includes(classId)) return { kind: "none", recovery: null, slots };
  throw new RangeError(`Unknown 5E class: ${classId}`);
}

export function sync5eSpellSlots(character, { preserveSpent = false } = {}) {
  if (character.ruleset !== "dnd5e-2014" || String(character.multiclass || "").trim()) return false;
  const progression = get5eSpellSlotProgression(character.classId, Number(character.level));
  for (let level = 1; level <= 9; level += 1) {
    const key = String(level);
    const old = character.spellSlots?.[key] ?? { current: 0, maximum: 0 };
    const maximum = progression.slots[level - 1];
    const spent = preserveSpent ? Math.max(0, (Number(old.maximum) || 0) - (Number(old.current) || 0)) : 0;
    character.spellSlots[key] = { current: Math.max(0, maximum - spent), maximum };
  }
  return true;
}
