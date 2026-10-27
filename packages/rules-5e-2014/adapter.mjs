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

export const rules5e2014 = {
  id: "dnd5e-2014",
  hitDieForClass: hitDieFor,

  validate(character) {
    if (character.ruleset !== this.id) throw new Error(`character ruleset must be ${this.id}`);
    validateSharedShape(character);
  },

  primaryHitDie(character) {
    return hitDieFor(character.classes[0].classId);
  },

  fixedHitPointsPerLevel(character) {
    return Math.floor(this.primaryHitDie(character) / 2) + 1;
  },

  trace() {
    return [{ key: "ruleset", label: "D&D 5E", source: "SRD 5.1 compatible adapter" }];
  },
};

function hitDieFor(classId) {
  const value = HIT_DICE[classId];
  if (!value) throw new Error(`unknown 5E class id: ${classId}`);
  return value;
}

function validateSharedShape(character) {
  for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
    if (!Number.isInteger(character.abilities?.[ability])) throw new TypeError(`missing ability: ${ability}`);
  }
  if (!Array.isArray(character.classes) || character.classes.length < 1) {
    throw new Error("at least one class is required");
  }
}
