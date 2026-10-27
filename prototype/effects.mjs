import { ABILITIES, SKILLS } from './content.mjs';
import { characterClasses, totalLevel, trainedArmor, entryEligibility } from './character-rules.mjs';
import { skillGrantState,parseBackgroundSkills } from './skill-grants.mjs';
import { advancementSourceStatus, advancementState } from './advancement.mjs';
import { proficiencyGrantState,TOOL_OPTIONS,LANGUAGE_OPTIONS } from './proficiency-grants.mjs';
import { collectFillEffects } from './fill-effects.mjs';

export function featureActivation(feature, c) {
  if (feature.effectMode === 'off') return { active: false, reason: '手动停用' };
  if ((feature.catalogEntry?.ruleset && feature.catalogEntry.ruleset !== c.ruleset) || (feature.sourceRuleset && feature.sourceRuleset !== c.ruleset)) return { active:false, reason:'资料规则版本不同' };
  if (feature.effectMode === 'manual') return {active:true,reason:'玩家确认应用；资格提示仅供参考'};
  const sourceIssue=advancementSourceStatus(feature,c);
  if(sourceIssue) return {active:false,reason:sourceIssue};
  if (feature.catalogEntry?.ruleset && feature.catalogEntry.ruleset !== c.ruleset) return { active:false, reason:'资料规则版本不同' };
  if (!feature.catalogEntry) return { active:true, reason:'自定义来源' };
  const eligibility = entryEligibility(feature.catalogEntry, c, { featureKind: feature.kind });
  if (eligibility.status === 'blocked') return { active:false, reason:eligibility.failures.join('；') };
  if (eligibility.status === 'review' && feature.effectMode !== 'confirmed') return { active:false, reason:`条件待确认：${eligibility.review.join('；')}` };
  return { active:true, reason:'' };
}

export function backgroundSkillIds(text) {
  return parseBackgroundSkills(text).fixed;
}
export function backgroundAbilityOptions(c) {
  if (c.ruleset !== 'dnd5r-2024' || c.backgroundSource?.ruleset !== c.ruleset || c.backgroundSource?.name !== c.background) return [];
  return Object.keys(ABILITIES).filter(id => String(c.backgroundSource.payload?.属性值 || '').includes(ABILITIES[id]));
}
export function characterEffects(c) {
  const source = c.backgroundSource?.ruleset === c.ruleset && c.backgroundSource?.name === c.background ? c.backgroundSource : null;
  const backgroundSkills = backgroundSkillIds(c.backgroundSource && !source ? '' : c.backgroundSkillProficiencies || source?.payload?.技能熟练);
  const choices = c.backgroundAbilityBonuses || {};
  const allowed = backgroundAbilityOptions(c);
  const selected = Object.entries(choices).filter(([,n]) => Number(n) > 0);
  const amounts = selected.map(([,n]) => Number(n)).sort();
  const valid = selected.length > 0 && selected.every(([id,n]) => allowed.includes(id) && [1,2].includes(Number(n))) && (amounts.join(',') === '1,2' || amounts.join(',') === '1,1,1');
  const backgroundAbilities = Object.fromEntries(Object.keys(ABILITIES).map(id => [id, Number(c.abilities[id]) + (valid ? Math.min(Number(choices[id] || 0), Math.max(0,20-Number(c.abilities[id]))) : 0)]));
  const advancement=advancementState(c,backgroundAbilities,featureActivation);
  const {abilities,activations}=advancement;
  const features = activations.filter(f => f.active).map(f=>f.feature);
  const originFeat = c.ruleset === 'dnd5r-2024' ? String(source?.payload?.专长 || '') : '';
  const effectFeatures=[...features];
  const hasOriginRecord=c.featureEntries.some(f=>f.kind==='feat'&&f.name.trim()===originFeat&&(!f.sourceRuleset||f.sourceRuleset===c.ruleset)&&(!f.catalogEntry?.ruleset||f.catalogEntry.ruleset===c.ruleset));
  if(originFeat&&!/选择|任选|或/.test(originFeat)&&!hasOriginRecord) effectFeatures.push({kind:'feat',name:originFeat});
  const fill=collectFillEffects(c,effectFeatures);
  advancement.savingThrows=[...new Set([...advancement.savingThrows,...fill.grants.save])];
  const proficiencyBase=proficiencyGrantState(c,features);
  const skillFeatures=[...features];
  if(c.ruleset==='dnd5r-2024'&&source?.payload?.专长==='熟习') skillFeatures.unshift({id:`background:${source.name}`,kind:'feat',name:'熟习',description:'你获得共计三项自选的技能和工具熟练。'});
  const skillInput={...c,skills:{...c.skills}};
  for(const id of fill.grants.skill) skillInput.skills[id]=Math.max(skillInput.skills[id]||0,1);
  for(const id of fill.grants.expertise) skillInput.skills[id]=2;
  const skillGrants=skillGrantState(skillInput,backgroundSkills,skillFeatures,[...proficiencyBase.tools,...fill.grants.tool]);
  for(const id of [...fill.grants.skill,...fill.grants.expertise]) skillGrants.sources[id].push('特性填卡效果');
  const proficiencyGrants={...proficiencyBase,tools:[...new Set([...proficiencyBase.tools,...skillGrants.tools,...fill.grants.tool])],languages:[...new Set([...proficiencyBase.languages,...fill.grants.language])]};
  const names = new Set(features.filter(f => f.kind === 'feat').map(f => f.name.trim()));
  if (originFeat && !/选择|任选|或/.test(originFeat)) names.add(originFeat);
  const styles = new Set(features.filter(f => f.kind === 'fighting').map(f => f.name.trim()));
  const hpBonus = fill.bonuses.hp;
  const initiativeBonus = fill.bonuses.initiative;
  const defenseBonus = fill.bonuses.ac;
  const trace = [...advancement.trace,...fill.trace];
  if (backgroundSkills.length) trace.push(`背景熟练：${backgroundSkills.map(id=>SKILLS[id].name).join('、')}`);
  if (valid) trace.push(`背景属性：${selected.map(([id,n])=>`${ABILITIES[id]} +${n}`).join('、')}（最高20）`);
  return { abilities, advancement, backgroundSkills, skillGrants, proficiencyGrants, fill, hpBonus, initiativeBonus, defenseBonus, originFeat, trace, activations, backgroundBonusesValid: valid,
    backgroundBonusWarning: c.backgroundSource && !source ? '背景来源与当前名称或规则版本不一致：旧文字保留，自动加成已停用。请选择当前版本的背景。' : selected.length && !valid ? '背景属性需在允许的三项中选择 +2/+1 或 +1/+1/+1；当前分配未应用。' : '',
    pendingFeats: [...names].filter(n => !['健壮','警觉'].includes(n)), styles };
}

export function effectiveProficiencies(c) {
  const effects=characterEffects(c),grants=effects.proficiencyGrants;
  const classes = characterClasses(c);
  const weapons = [c.weaponProficiencies || '',...effects.fill.grants.weapon];
  const martial = ['barbarian','fighter','paladin','ranger'];
  for (const [index, item] of classes.entries()) {
    if (index > 0) {
      if (martial.includes(item.classId)) weapons.push('简易武器','军用武器');
      else if (item.classId === 'warlock' && c.ruleset === 'dnd5e-2014') weapons.push('简易武器');
      else if (item.classId === 'monk' && c.ruleset === 'dnd5e-2014') weapons.push('简易武器','短剑');
      continue;
    }
    if (martial.includes(item.classId)) weapons.push('简易武器','军用武器');
    else if (item.classId === 'wizard' || item.classId === 'sorcerer') weapons.push(...(c.ruleset === 'dnd5r-2024' ? ['简易武器'] : ['匕首','飞镖','投石索','长棍','轻弩']));
    else if (item.classId === 'druid' && c.ruleset === 'dnd5e-2014') weapons.push('短棒','匕首','飞镖','标枪','硬头锤','长棍','弯刀','镰刀','投石索','矛');
    else weapons.push('简易武器');
    if (c.ruleset === 'dnd5e-2014' && ['bard','rogue'].includes(item.classId) && index === 0) weapons.push('手弩','长剑','刺剑','短剑');
    if (item.classId === 'monk') weapons.push(...(c.ruleset==='dnd5e-2014'?['短剑']:['弯刀','短剑','手弩']));
    if (item.classId === 'rogue' && c.ruleset==='dnd5r-2024') weapons.push('弯刀','短剑','刺剑','细剑','鞭','手弩');
  }
  return { weapons: [...new Set(weapons.flatMap(s=>s.split(/[，,、；;]/)).filter(Boolean))], armor: [...new Set([...trainedArmor(c).trim().split(/\s+/),...effects.fill.grants.armor].filter(Boolean))].join('、'),
    tools: grants.tools.join('、'),languages:grants.languages.join('、'),grants };
}

export const PROFICIENCY_OPTIONS = {
  toolProficiencies: TOOL_OPTIONS,
  knownLanguages: LANGUAGE_OPTIONS,
  armorTraining: ['轻甲','中甲','重甲','盾牌'],
  weaponProficiencies: ['简易武器','军用武器','匕首','短棒','长棍','矛','标枪','手斧','轻锤','硬头锤','短弓','轻弩','飞镖','投石索','长剑','短剑','刺剑','巨剑','巨斧','战斧','战锤','长弓','重弩','手弩','长戟','长柄刀','长矛','细剑','链枷','鞭','三叉戟','骑枪']
};
