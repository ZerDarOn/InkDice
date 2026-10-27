const HIT_DICE = {
  artificer: 8,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  sorcerer: 6,
  wizard: 6,
};

export const rules5r2024 = {
  id: "dnd5r-2024",
  hitDieForClass(classId) {
    if (!HIT_DICE[classId]) throw new Error(`unknown class: ${classId}`);
    return HIT_DICE[classId];
  },

  validate(character) {
    if (character.ruleset !== this.id) throw new Error(`character ruleset must be ${this.id}`);
    for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
      if (!Number.isInteger(character.abilities?.[ability])) throw new TypeError(`missing ability: ${ability}`);
    }
    if (!Array.isArray(character.classes) || character.classes.length < 1) {
      throw new Error("at least one class is required");
    }
  },

  primaryHitDie(character) {
    const value = HIT_DICE[character.classes[0].classId];
    if (!value) throw new Error(`unknown 5R class id: ${character.classes[0].classId}`);
    return value;
  },

  fixedHitPointsPerLevel(character) {
    return Math.floor(this.primaryHitDie(character) / 2) + 1;
  },

  trace() {
    return [{ key: "ruleset", label: "D&D 5R", source: "SRD 5.2.1 compatible adapter" }];
  },
};
