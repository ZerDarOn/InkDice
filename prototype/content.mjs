export const RULESETS = {
  'coc-7e': {shortName:'CoC · 七版',fullName:'克苏鲁的呼唤 七版',pack:'CY23PlusFinal 工作簿资料'},
  "dnd5r-2024": {
    shortName: "5R · 2024",
    fullName: "D&D 2024 修订规则",
    pack: "SRD 5.2.1 核心",
  },
  "dnd5e-2014": {
    shortName: "5E · 2014",
    fullName: "D&D 5E 2014 规则",
    pack: "SRD 5.1 核心",
  },
};

export const RULE_ENGINES = {
  "dnd5r-2024": {
    name: "D&D 5R",
    detail: "2024 修订规则 · SRD 5.2.1",
    status: "installed",
    kind: "dnd",
  },
  "dnd5e-2014": {
    name: "D&D 5E",
    detail: "2014 规则 · SRD 5.1",
    status: "installed",
    kind: "dnd",
  },
  "coc-7e": {
    name: "Call of Cthulhu",
    detail: "CoC 七版 · 独立调查员卡与资料库",
    status: "installed",
    kind: "coc",
  },
};

export const ABILITIES = {
  str: "力量",
  dex: "敏捷",
  con: "体质",
  int: "智力",
  wis: "感知",
  cha: "魅力",
};

export const CLASSES = {
  artificer: { name: "奇械师", hitDie: 8, saves: ["con", "int"], casting: "int" },
  barbarian: { name: "野蛮人", hitDie: 12, saves: ["str", "con"] },
  bard: { name: "吟游诗人", hitDie: 8, saves: ["dex", "cha"], casting: "cha" },
  cleric: { name: "牧师", hitDie: 8, saves: ["wis", "cha"], casting: "wis" },
  druid: { name: "德鲁伊", hitDie: 8, saves: ["int", "wis"], casting: "wis" },
  fighter: { name: "战士", hitDie: 10, saves: ["str", "con"] },
  monk: { name: "武僧", hitDie: 8, saves: ["str", "dex"] },
  paladin: { name: "圣武士", hitDie: 10, saves: ["wis", "cha"], casting: "cha" },
  ranger: { name: "游侠", hitDie: 10, saves: ["str", "dex"], casting: "wis" },
  rogue: { name: "游荡者", hitDie: 8, saves: ["dex", "int"] },
  sorcerer: { name: "术士", hitDie: 6, saves: ["con", "cha"], casting: "cha" },
  warlock: { name: "邪术师", hitDie: 8, saves: ["wis", "cha"], casting: "cha" },
  wizard: { name: "法师", hitDie: 6, saves: ["int", "wis"], casting: "int" },
};

export const SKILLS = {
  acrobatics: { name: "特技", ability: "dex" },
  animalHandling: { name: "驯兽", ability: "wis" },
  arcana: { name: "奥秘", ability: "int" },
  athletics: { name: "运动", ability: "str" },
  deception: { name: "欺瞒", ability: "cha" },
  history: { name: "历史", ability: "int" },
  insight: { name: "洞悉", ability: "wis" },
  intimidation: { name: "威吓", ability: "cha" },
  investigation: { name: "调查", ability: "int" },
  medicine: { name: "医药", ability: "wis" },
  nature: { name: "自然", ability: "int" },
  perception: { name: "察觉", ability: "wis" },
  performance: { name: "表演", ability: "cha" },
  persuasion: { name: "游说", ability: "cha" },
  religion: { name: "宗教", ability: "int" },
  sleightOfHand: { name: "巧手", ability: "dex" },
  stealth: { name: "隐匿", ability: "dex" },
  survival: { name: "求生", ability: "wis" },
};

export const ARMORS = {
  padded: { name: "布甲", category: "light", base: 11 },
  unarmored: { name: "无甲", category: "unarmored", base: 10 },
  leather: { name: "皮甲", category: "light", base: 11 },
  studdedLeather: { name: "镶钉皮甲", category: "light", base: 12 },
  hide: { name: "兽皮甲", category: "medium", base: 12 },
  chainShirt: { name: "链甲衫", category: "medium", base: 13 },
  scaleMail: { name: "鳞甲", category: "medium", base: 14 },
  breastplate: { name: "胸甲", category: "medium", base: 14 },
  halfPlate: { name: "半身板甲", category: "medium", base: 15 },
  ringMail: { name: "环甲", category: "heavy", base: 14 },
  chainMail: { name: "锁子甲", category: "heavy", base: 16 },
  splint: { name: "板条甲", category: "heavy", base: 17 },
  plate: { name: "板甲", category: "heavy", base: 18 },
};

export const TRACE_LABELS = {
  armorClass: "护甲等级",
  hitPoints: "最大生命值",
  initiative: "先攻",
  proficiencyBonus: "熟练加值",
  passivePerception: "被动察觉",
  spellSaveDc: "法术豁免 DC",
};
