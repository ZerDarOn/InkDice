import { totalLevel } from './character-rules.mjs';

// Cumulative XP, not XP spent per level. Verified against both supplied workbooks.
export const EXPERIENCE_THRESHOLDS = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]);
export const EXPERIENCE_SOURCES = Object.freeze({
  'dnd5e-2014': '5E 人物卡「主要情况」Z4 批注（2–20 级）',
  'dnd5r-2024': '5R 人物卡「数据表」CI3:CJ22',
});

export function experienceProgress(character) {
  if (!EXPERIENCE_SOURCES[character.ruleset]) return null;
  const level = totalLevel(character);
  const xp = Number(character.experience);
  const validXp = Number.isSafeInteger(xp) && xp >= 0;
  const levels = [character.level, ...(character.multiclasses || []).map(row => row.level)].map(Number);
  const validLevel = levels.every(n => Number.isInteger(n) && n >= 1 && n <= 20) && level <= 20;
  const xpLevel = validXp ? EXPERIENCE_THRESHOLDS.filter(minimum => xp >= minimum).length : null;
  const nextLevel = validLevel && level < 20 ? level + 1 : null;
  const nextXp = nextLevel === null ? null : EXPERIENCE_THRESHOLDS[nextLevel - 1];
  return {
    level: validLevel ? level : null, xp: validXp ? xp : null, xpLevel,
    minimum: validLevel ? EXPERIENCE_THRESHOLDS[level - 1] : null,
    nextLevel, nextXp,
    remaining: validXp && nextXp !== null ? Math.max(0, nextXp - xp) : null,
    source: EXPERIENCE_SOURCES[character.ruleset],
  };
}

export function experienceHint(progress) {
  if (!progress) return '当前系统暂无经验表';
  if (progress.xp === null) return '经验值请填写非负整数';
  if (progress.level === null) return '请先将职业总等级设为 1–20 级';
  const number = n => n.toLocaleString('zh-CN');
  const current = `总等级 ${progress.level} · 本级门槛 ${number(progress.minimum)} XP`;
  if (progress.nextLevel === null) return `${current} · 已到 20 级，后续由 DM 决定`;
  if (progress.remaining === 0) return `${current} · 经验已达 ${progress.xpLevel} 级门槛，请自行分配职业等级`;
  return `${current} · 距 ${progress.nextLevel} 级还差 ${number(progress.remaining)} XP`;
}
