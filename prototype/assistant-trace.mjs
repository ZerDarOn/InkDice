import {ABILITIES,ARMORS,CLASSES} from './content.mjs';
const sign=n=>n>=0?`+${n}`:String(n);

export function buildCalculationTrace(c,d,key) {
  const terms=[],add=(label,value)=>terms.push({label,value:Number(value)}),bonuses=d.effects.fill.bonuses;
  let title,result,notes='',sources=[];
  switch(key) {
    case 'hitPoints': {
      title='最大生命值';result=d.hitPoints;let remaining=d.level;
      for(const [index,row] of d.classLevels.entries()) {
        const levels=Math.min(row.level,remaining);remaining-=levels;if(!levels) continue;
        const die=CLASSES[row.classId].hitDie,con=d.abilityModifiers.con;
        if(index===0) add(`${CLASSES[row.classId].name}首级：d${die}最大值 ${sign(con)} 体质`,die+con);
        const later=levels-(index===0?1:0),per=Math.max(1,Math.floor(die/2)+1+con);
        if(later) add(`${CLASSES[row.classId].name}后续 ${later} 级 × ${per}`,later*per);
      }
      if(d.mechanics.hpBonus) add('龙族体魄（术士等级）',d.mechanics.hpBonus);
      if(bonuses.hp) add('已应用特性加值',bonuses.hp);
      sources=d.effects.fill.trace.filter(s=>s.includes('最大生命值'));
      notes='按各职业生命骰固定升级值计算；这里是生命上限，不是当前生命。';break;
    }
    case 'initiative':
      title='先攻';result=d.initiative;add('敏捷调整值',d.abilityModifiers.dex);
      if(d.mechanics.jackInitiative) add('万事通（熟练加值的一半，向下取整）',Math.floor(d.proficiencyBonus/2));
      if(bonuses.initiative) add('已应用特性加值',bonuses.initiative);
      sources=d.effects.fill.trace.filter(s=>s.includes('先攻'));break;
    case 'proficiencyBonus':
      title='熟练加值';result=d.proficiencyBonus;add('基础',2);add(`总等级 ${d.level}：floor((等级 − 1) / 4)`,Math.floor((d.level-1)/4));
      notes='使用全部职业等级之和。';break;
    case 'passivePerception':
      title='被动察觉';result=d.passivePerception;add('基础',10);add('当前察觉检定总值',d.skills.perception);
      notes='察觉总值已包含已应用的熟练、专精、万事通及数值修正；情境性优势、劣势未在此裁定。';break;
    case 'spellSaveDc':
      title='法术豁免 DC';result=d.spellcasting?.saveDc??null;
      if(result===null) {notes='当前未选择可计算的施法职业，未生成法术 DC。';break;}
      add('基础',8);add('熟练加值',d.proficiencyBonus);add(`${ABILITIES[d.castingAbility]}调整值`,d.abilityModifiers[d.castingAbility]);
      if(bonuses.spellDc) add('已应用特性加值',bonuses.spellDc);
      notes=`当前施法职业：${CLASSES[d.castingClassId]?.name||'自定义'}。`;
      sources=d.effects.fill.trace.filter(s=>s.includes('法术 DC'));break;
    default: {
      key='armorClass';title='护甲等级';result=d.armorClass;
      const armor=ARMORS[c.armorId],dex=d.abilityModifiers.dex;
      add(`${armor.name}基础`,armor.base);
      add(armor.category==='medium'?'敏捷调整值（最高 +2）':armor.category==='heavy'?'重甲不计敏捷':'敏捷调整值',armor.category==='heavy'?0:armor.category==='medium'?Math.min(2,dex):dex);
      if(c.armorBonus) add('手填护甲加值',c.armorBonus);
      if(c.shield) add('已着装盾牌',c.shieldAcBonus??2);
      const armorTotal=terms.reduce((sum,t)=>sum+t.value,0);
      const defense=d.mechanics.defenses.reduce((best,row)=>row.ac>(best?.ac??armorTotal)?row:best,null);
      if(defense) {terms.length=0;add(`${defense.name}基础方案（替代普通护甲计算）`,defense.ac);}
      if(bonuses.ac) add('已应用特性加值',bonuses.ac);
      sources=d.effects.fill.trace.filter(s=>s.includes('：AC '));
      notes='使用当前已实现的护甲/无甲方案及已应用加值；未自动判定所有情境或魔法效果。';
    }
  }
  const residual=result===null?0:result-terms.reduce((sum,t)=>sum+t.value,0);
  if(residual) {add('其他引擎调整（尚未分项）',residual);notes+=' 有未分项的调整，请核对来源。';}
  return {key,title,result:result===null?'—':result,terms,sources,complete:residual===0,formula:terms.length?`${terms.map((t,i)=>i?sign(t.value):String(t.value)).join(' ')} = ${result}`:'没有可计算的数据',notes};
}
