import { ABILITIES, SKILLS, CLASSES } from './content.mjs';
import { BONUS_TARGETS, EFFECT_SCALES, GRANT_TYPES, featureFillEffects } from './fill-effects.mjs';

export const EFFECT_MODES=[['auto','自动应用'],['manual','玩家确认应用'],['off','停用'],['confirmed','确认待核对条件（旧模式）']];
export function renderFillEffectEditor(feature,ruleset,escape,opened=false) {
  const rows=featureFillEffects(feature,ruleset),id=escape(feature.id);
  const opts=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${escape(key)}" ${key===selected?'selected':''}>${escape(label)}</option>`).join('');
  return `<details class="fill-effect-editor" data-effect-editor="${id}" ${opened?'open':''}><summary>自动填卡效果 · ${rows.length} 项${Array.isArray(feature.fillEffects)?' · 自定义':''}</summary>
    <div class="fill-effect-toolbar"><label>应用方式<select data-feature-id="${id}" data-feature-field="effectMode" aria-label="${escape(feature.name||'此特性')}应用方式">${opts(Object.fromEntries(EFFECT_MODES),feature.effectMode||'auto')}</select></label><button type="button" data-fill-action="add" data-fill-owner="${id}">＋ 效果</button><button type="button" data-fill-action="reset" data-fill-owner="${id}">恢复预设</button></div>
    <p>支持固定值、按等级加值及熟练授予；更改后随卡重算。这里替换本条的数值预设，不改动已填的基础值、属性选项和资源。复杂条件请自行确认，或停用。</p>
    ${rows.map((row,index)=>{
      const attr=`data-fill-owner="${id}" data-fill-index="${index}"`;
      const targets=row.type==='bonus'?BONUS_TARGETS:row.type==='save'?ABILITIES:['skill','expertise'].includes(row.type)?Object.fromEntries(Object.entries(SKILLS).map(([id,s])=>[id,s.name])):null;
      return `<div class="fill-effect-row"><label>效果<select ${attr} data-fill-field="type" aria-label="效果类型">${opts({bonus:'数值加成',...GRANT_TYPES},row.type)}</select></label><label>作用项${targets?`<select ${attr} data-fill-field="target" aria-label="效果作用项">${opts(targets,row.target)}</select>`:`<input ${attr} data-fill-field="target" aria-label="授予名称" value="${escape(row.target)}" placeholder="填写一种${escape(GRANT_TYPES[row.type])}" maxlength="100" />`}</label>
      ${row.type==='bonus'?`<label>加值<input type="number" min="-9999" max="9999" ${attr} data-fill-field="value" aria-label="效果加值" value="${row.value}" /></label><label>计算<select ${attr} data-fill-field="scale" aria-label="效果计算方式">${opts(EFFECT_SCALES,row.scale)}</select></label>${row.scale==='classLevel'?`<label>职业<select ${attr} data-fill-field="classId" aria-label="效果职业"><option value="">请选择</option>${opts(Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,c.name])),row.classId)}</select></label>`:''}<label>条件<select ${attr} data-fill-field="condition" aria-label="效果条件">${opts({always:'一直生效',armored:'着甲时'},row.condition)}</select></label>`:''}
      <button type="button" ${attr} data-fill-action="remove" aria-label="移除第 ${index+1} 项填卡效果">×</button></div>`;
    }).join('')||'<p>尚无数值预设。可自行添加效果；原文说明仍保留。</p>'}
  </details>`;
}
