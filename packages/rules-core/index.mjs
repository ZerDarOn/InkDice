const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

export function abilityModifier(score) {
  assertInteger(score, "ability score");
  if (score < 1 || score > 30) throw new RangeError("ability score must be between 1 and 30");
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(totalLevel) {
  assertInteger(totalLevel, "total level");
  if (totalLevel < 1 || totalLevel > 20) throw new RangeError("total level must be between 1 and 20");
  return 2 + Math.floor((totalLevel - 1) / 4);
}

export function totalCharacterLevel(classes) {
  if (!Array.isArray(classes) || classes.length === 0) throw new TypeError("classes must be a non-empty array");
  const total = classes.reduce((sum, item) => sum + item.level, 0);
  if (total > 20) throw new RangeError("combined class levels cannot exceed 20");
  return total;
}

export function calculateArmorClass({ dexterityModifier, armor, shield = false, bonuses = [] }) {
  assertInteger(dexterityModifier, "dexterity modifier");
  const item = armor ?? { category: "unarmored", base: 10 };
  let dexterityContribution = dexterityModifier;

  if (item.category === "medium") dexterityContribution = Math.min(2, dexterityModifier);
  if (item.category === "heavy") dexterityContribution = 0;
  if (!new Set(["unarmored", "light", "medium", "heavy"]).has(item.category)) {
    throw new TypeError(`unsupported armor category: ${item.category}`);
  }

  return item.base + dexterityContribution + (shield ? 2 : 0) + sumIntegers(bonuses, "armor bonuses");
}

export function calculateHitPoints({ hitDie, levels, constitutionModifier, fixedPerLevel, bonuses = [] }) {
  for (const [name, value] of Object.entries({ hitDie, levels, constitutionModifier, fixedPerLevel })) {
    assertInteger(value, name);
  }
  if (levels < 1 || levels > 20) throw new RangeError("levels must be between 1 and 20");
  if (hitDie < 4 || hitDie % 2 !== 0) throw new RangeError("hitDie must be an even die size of at least 4");
  const firstLevel = hitDie + constitutionModifier;
  const laterLevels = (levels - 1) * Math.max(1, fixedPerLevel + constitutionModifier);
  return firstLevel + laterLevels + sumIntegers(bonuses, "hit point bonuses");
}

export function calculateCheck({ ability, proficiency = 0, expertise = false, flatBonus = 0 }) {
  for (const [name, value] of Object.entries({ ability, proficiency, flatBonus })) assertInteger(value, name);
  return ability + (expertise ? proficiency * 2 : proficiency) + flatBonus;
}

export function deriveCharacter(character, adapter) {
  adapter.validate(character);
  const level = totalCharacterLevel(character.classes);
  const proficiency = proficiencyBonus(level);
  const modifiers = Object.fromEntries(ABILITIES.map((ability) => [ability, abilityModifier(character.abilities[ability])]));
  const savingThrows = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      calculateCheck({
        ability: modifiers[ability],
        proficiency: character.proficiencies.savingThrows.includes(ability) ? proficiency : 0,
        flatBonus: character.adjustments?.savingThrows?.[ability] ?? 0,
      }),
    ]),
  );
  const skills = Object.fromEntries(
    Object.entries(character.skills).map(([skill, config]) => [
      skill,
      calculateCheck({
        ability: modifiers[config.ability],
        proficiency: config.proficient ? proficiency : 0,
        expertise: Boolean(config.expertise),
        flatBonus: config.flatBonus ?? 0,
      }),
    ]),
  );
  const castingAbility = character.spellcasting?.ability;
  const spellcasting = castingAbility
    ? {
        saveDc: 8 + proficiency + modifiers[castingAbility] + (character.spellcasting.dcBonus ?? 0),
        attackBonus: proficiency + modifiers[castingAbility] + (character.spellcasting.attackBonus ?? 0),
      }
    : null;

  return {
    ruleset: adapter.id,
    level,
    proficiencyBonus: proficiency,
    abilityModifiers: modifiers,
    armorClass: calculateArmorClass({
      dexterityModifier: modifiers.dex,
      armor: character.equipment.armor,
      shield: character.equipment.shield,
      bonuses: character.adjustments?.armorClass ?? [],
    }),
    hitPoints: character.classes.reduce((sum, item, index) => {
      const die = adapter.hitDieForClass(item.classId);
      return sum + (index === 0 ? die + modifiers.con : 0)
        + (item.level - (index === 0 ? 1 : 0)) * Math.max(1, Math.floor(die / 2) + 1 + modifiers.con);
    }, 0) + sumIntegers(character.adjustments?.hitPoints ?? [], "hit point bonuses"),
    initiative: modifiers.dex + (character.adjustments?.initiative ?? 0),
    savingThrows,
    skills,
    spellcasting,
    trace: adapter.trace(character),
  };
}

function assertInteger(value, name) {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
}

function sumIntegers(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  values.forEach((value) => assertInteger(value, name));
  return values.reduce((sum, value) => sum + value, 0);
}
