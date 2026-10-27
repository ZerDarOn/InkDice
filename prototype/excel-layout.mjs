import { ABILITIES, ARMORS, CLASSES, RULESETS, SKILLS } from './content.mjs';
import { deriveMvpCharacter, getAttunedEquipment, orderSpellsForBook } from './model.mjs';
import { characterClasses } from './character-rules.mjs';
import { effectiveProficiencies } from './effects.mjs';
import { weaponCalculation, resourceDefinitions } from './automation.mjs';
import { hitDiceState } from './hit-dice.mjs';
import {isCoc,deriveCoc,ATTRIBUTES,skillValue,skillName,weaponChance,diceText} from './coc/model.mjs';

export const EXCEL_SHEETS = ['人物', '主要情况', '施法', '部署生物', '背包'];
export const EXCEL_STYLES = {
  body: { font: { name: 'Microsoft YaHei', size: 11, color: '#242B35' }, wrapText: true, verticalAlignment: 'center', borders: { bottom: { style: 'hair', color: '#DCE3E8' } } },
  title: { font: { name: 'Microsoft YaHei', size: 17, bold: true, color: '#253C51' }, wrapText: true, verticalAlignment: 'center' },
  muted: { font: { name: 'Microsoft YaHei', size: 10, color: '#596574' }, wrapText: true, verticalAlignment: 'center' },
  section: { fill: '#E4EBF0', font: { name: 'Microsoft YaHei', size: 12, bold: true, color: '#253C51' }, wrapText: true, verticalAlignment: 'center' },
  header: { fill: '#344E64', font: { name: 'Microsoft YaHei', size: 11, bold: true, color: '#FFFFFF' }, wrapText: true, horizontalAlignment: 'center', verticalAlignment: 'center' },
  label: { fill: '#F0F3F5', font: { name: 'Microsoft YaHei', size: 11, color: '#475566' }, wrapText: true, verticalAlignment: 'center' },
  number: { font: { name: 'Microsoft YaHei', size: 11, color: '#242B35' }, numberFormat: 'General', horizontalAlignment: 'right', verticalAlignment: 'center', borders: { bottom: { style: 'hair', color: '#DCE3E8' } } },
  total: { fill: '#F3EDDD', font: { name: 'Microsoft YaHei', size: 11, bold: true, color: '#343020' }, numberFormat: 'General', wrapText: true, verticalAlignment: 'center' },
};
export const columnName = n => { let s=''; for (; n>0; n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; };
const yes = value => value ? '是' : '否';
const plain = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value;
const weightedLength = value => [...String(value)].reduce((n,ch)=>n+(ch.codePointAt(0)>255?1.9:1),0);

// Split long prose into visible continuation rows, not a single clipped Excel cell.
export function textChunks(value, span, maxLines = 5) {
  if (typeof value !== 'string') return [plain(value)];
  const chunks=[]; let part='',units=0;
  const lineWidth=Math.max(8,span*9-3), budget=lineWidth*maxLines;
  for(const char of value) {
    const weight=char==='\n'?lineWidth:char.codePointAt(0)>255?1.9:1;
    if(units+weight>budget&&part) {chunks.push(part);part='';units=0;}
    part+=char;units+=weight;
  }
  chunks.push(part); return chunks;
}

class Sheet {
  constructor(name, character) {
    this.name=name; this.rows=[]; this.cells=[]; this.images=[]; this.breaks=[];
    this.widths=Array(12).fill(9); this.orientation='landscape'; this.freeze=3;
    this.row([''],[12]);
    this.row([`${character.name || '未命名角色'}　${name}`],[12],'title',32);
    this.row([`${RULESETS[character.ruleset]?.fullName || character.ruleset}　玩家：${character.player || '未填写'}`],[12],'muted',24);
  }
  row(values, spans=values.map(()=>12/values.length), style='body', fixedHeight) {
    if(spans.reduce((a,b)=>a+b,0)!==12||spans.some(n=>!Number.isInteger(n)||n<1)) throw Error('Excel 列宽定义无效');
    const chunks=values.map((v,i)=>textChunks(plain(v),spans[i]));
    const start=this.rows.length+1;
    for(let k=0;k<Math.max(...chunks.map(a=>a.length));k++) {
      let col=1,lines=1;
      values.forEach((_,i)=>{
        const value=chunks[i][k]??'';
        lines=Math.max(lines,...String(value).split('\n').map(line=>Math.ceil(weightedLength(line)/Math.max(8,spans[i]*9-3))));
        // Count explicit newlines as well as wrapped lines.
        lines=Math.max(lines,String(value).split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(weightedLength(line)/Math.max(8,spans[i]*9-3))),0));
        this.cells.push({row:this.rows.length+1,col,span:spans[i],value,style:typeof value==='number'&&style==='body'?'number':style});
        col+=spans[i];
      });
      this.rows.push(Math.max(fixedHeight??26,lines*16+10));
    }
    return start;
  }
  section(title) { this.row([title],[12],'section',27); }
  field(label,value) { const r=this.row([label,plain(value)],[2,10]);this.cells.filter(c=>c.row>=r&&c.col===1).forEach(c=>c.style='label');return r; }
  pairs(pairs) {
    const values=[]; for(const [name,value] of pairs) values.push(name,plain(value));
    while(values.length<6)values.push('','');
    const r=this.row(values,[2,2,2,2,2,2]);
    this.cells.filter(c=>c.row>=r&&[1,5,9].includes(c.col)).forEach(c=>c.style='label');
    return r;
  }
  table(headers,spans,rows) {
    this.row(headers,spans,'header');
    for(const row of rows) this.row(row,spans);
    if(!rows.length)this.row(['暂无记录'],[12],'muted');
  }
  formula(row,col,formula,value) {
    const cell=this.cells.find(c=>c.row===row&&c.col===col);
    cell.formula=formula;cell.value=value;cell.style='total';
  }
}

export function buildExcelLayout(c) {
  if(isCoc(c))return buildCocExcel(c);
  const d=deriveMvpCharacter(c), sheets=EXCEL_SHEETS.map(name=>new Sheet(name,c));
  const [identity,main,spells,creatures,inventory]=sheets;
  const classes=characterClasses(c).map(x=>`${CLASSES[x.classId]?.name || x.classId} ${x.level}级${x.subclass?' · '+x.subclass:''}`).join(' / ');
  identity.orientation='portrait';
  identity.row(['当前人物快照。规则派生值以导出时为准；Excel 编辑不回写应用，完整恢复请另存 JSON。'],[12],'muted');
  identity.section('身份与外貌');
  const identityFields=[['姓名',c.name],['玩家',c.player],['种族',c.species],['亚种',c.subrace],['性别',c.gender],['阵营',c.alignment],['年龄',c.age],['信仰',c.faith],['背景',c.background],['体型',c.size],['身高',c.height],['体重',c.weight],['发色',c.hair],['肤色',c.skin],['瞳色',c.eyes]];
  const portraitStart=identity.rows.length;
  for(let i=0;i<identityFields.length;i+=2) {
    const [label,value]=identityFields[i], [second,other]=identityFields[i+1]||['',''];
    const r=identity.row([label,value,second,other,''],[1,3,1,3,4],'body',34);
    identity.cells.filter(x=>x.row===r&&[1,5].includes(x.col)).forEach(x=>x.style='label');
  }
  if(c.portrait)identity.images.push({dataUrl:c.portrait,row:portraitStart,col:8,width:250,height:320});
  else identity.cells.find(x=>x.row===portraitStart+1&&x.col===9).value='未设置立绘';
  identity.field('职业与等级',classes);
  for(const [label,key] of [['角色外貌','appearance'],['角色形象','characterImage']]) { identity.section(label);identity.row([c[key]||''],[12]); }
  identity.section('背景与经历');
  for(const [label,key] of [['技能熟练','backgroundSkillProficiencies'],['工具熟练','backgroundToolProficiencies'],['背景语言','backgroundLanguages'],['背景装备','backgroundEquipment'],['特殊选项','backgroundSpecialOptions'],['背景特性','backgroundFeature'],['个性特点 I','personality'],['个性特点 II','personalityTwo'],['理想','ideal'],['牵绊','bond'],['缺点','flaw']]) identity.field(label,c[key]);
  identity.section('背景故事'); identity.row([c.backgroundStory||''],[12]);
  if(c.notes){identity.section('原人物备注');identity.row([c.notes],[12]);}

  main.section('战斗数据');
  main.pairs([['现有HP',c.currentHp],['最大HP',d.hitPoints],['临时HP',c.tempHp]]);
  main.pairs([['AC',d.armorClass],['先攻',d.initiative],['速度',`${d.speed} 尺`]]);
  main.pairs([['熟练',d.proficiencyBonus],['被动察觉',d.passivePerception],['法术DC',d.spellcasting?.saveDc??'—']]);
  main.pairs([['生命骰',d.hitDiceLabel],['现有骰',hitDiceState(c).current],['经验值',c.experience]]);
  main.field('职业与兼职',classes);
  for(const [label,key] of [['抗性','resistances'],['免疫','immunities'],['感官','senses']])main.field(label,c[key]);
  if(c.defensesSenses)main.field('原合并记录',c.defensesSenses);
  main.section('六项属性与豁免');
  main.row(['属性','基础值','生效值','调整值','豁免','熟练'],[2,2,2,2,2,2],'header');
  for(const [id,name] of Object.entries(ABILITIES)) {
    const r=main.row([name,c.abilities[id],d.effects.abilities[id],Math.floor((d.effects.abilities[id]-10)/2),d.savingThrows[id],yes(d.effects.advancement.savingThrows.includes(id))],[2,2,2,2,2,2]);
    main.formula(r,7,`FLOOR((E${r}-10)/2,1)`,Math.floor((d.effects.abilities[id]-10)/2));
  }
  main.section('技能');
  main.table(['技能','属性','熟练程度','检定总值'],[4,2,3,3],Object.entries(SKILLS).map(([id,s])=>[s.name,ABILITIES[s.ability],['未熟练','熟练','专精'][d.effects.skillGrants.ranks[id]]||'未熟练',d.skills[id]]));
  main.section('武器');
  main.field('攻击属性 / 弹药',`${ABILITIES[c.weaponAttackAbility]||''}　${c.ammunitionName||''}　数量 ${c.ammunitionCount}`);
  (c.weapons||[]).forEach((w,i)=>{
    const hasText=['name','weaponType','properties','effect','damageDie','damageType','extraDamageDie','extraDamageType','mastery','ability'].some(key=>w[key]);
    if(!hasText&&!w.attuned&&!w.bonus&&!w.proficient&&(!w.attackDie||/^d20$/i.test(w.attackDie.trim()))) return;
    const calc=weaponCalculation(c,w);
    main.row([['右手','左手','双手','备用一','备用二'][i]||`武器 ${i+1}`,w.weaponType,w.name],[2,3,7],'header');
    main.pairs([['同调',yes(w.attuned)],['加值',w.bonus],['熟练',yes(calc.proficient??w.proficient)]]);
    main.pairs([['攻击骰',calc.attackDie??w.attackDie],['伤害骰',calc.damageDie],['类型',w.damageType]]);
    main.pairs([['附加伤害',w.extraDamageDie],['附加类型',w.extraDamageType],['精通',w.mastery]]);
    main.field('特性',w.properties);main.field('效果',w.effect);
  });
  main.section('护甲与盾牌');
  main.field('护甲',`${ARMORS[c.armorId]?.name||c.armorId}　${c.equipmentArmor||''}`);
  main.pairs([['同调',yes(c.equipmentArmorAttuned)],['加值',c.armorBonus],['基础AC',ARMORS[c.armorId]?.base??'']]);
  const armor=ARMORS[c.armorId],dex=d.abilityModifiers.dex;
  main.pairs([['护甲AC',(armor?.base??10)+Number(c.armorBonus||0)],['敏捷加值',armor?.category==='heavy'?0:armor?.category==='medium'?Math.min(2,dex):dex],['最终AC',d.armorClass]]);
  main.field('护甲特性',c.armorProperty);
  main.field('盾牌',c.shieldName);main.pairs([['同调',yes(c.shieldAttuned)],['盾牌AC',c.shieldAcBonus],['着装',yes(c.shield)]]);
  main.section(`奇物与同调（已同调 ${getAttunedEquipment(c).length} / ${d.mechanics.attunementLimit}）`);
  main.table(['奇物名称','同调','稀有度','部位','特性'],[3,1,2,2,4],(c.curios||[]).map(x=>[x.name,yes(x.attuned),x.rarity,x.slot,x.properties]));
  const prof=effectiveProficiencies(c);
  main.section('熟练与其他特性');
  for(const [label,value] of [['武器熟练',prof.weapons],['护甲受训',prof.armor],['工具熟练',prof.tools],['语言',prof.languages]])main.field(label,Array.isArray(value)?value.join('、'):value);
  for(const [label,key] of [['激励','inspiration'],['伤患','injuries'],['声望','renown'],['献力','piety'],['祝福','blessings'],['护咒','charms'],['传奇恩惠','epicBoons']])main.field(label,c[key]);
  const categories={class:'职业能力',species:'种族特性',feat:'专长',fighting:'战斗风格',special:'特殊能力'};
  for(const [kind,label] of Object.entries(categories)) {
    main.section(label);
    const entries=(c.featureEntries||[]).filter(f=>f.kind===kind);
    for(const f of entries) {
      main.row([f.level||'',f.name||'未命名能力',f.maximum?`${f.current??0} / ${f.maximum}　${f.recovery||''}`:f.recovery||''],[1,7,4],'header');
      main.row([f.description||''],[12]);
      if(f.sourceNote||f.catalogEntry?.sourceBook)main.field('来源',f.sourceNote||f.catalogEntry.sourceBook);
    }
    const legacy=c[{class:'classFeatures',species:'speciesFeatures',feat:'feats'}[kind]];
    if(legacy)main.row([legacy],[12]);
    if(!entries.length&&!legacy)main.row(['暂无记录'],[12],'muted');
  }
  main.section('资源');
  main.table(['名称','现有','上限','恢复方式'],[4,1,1,6],resourceDefinitions(c).map(r=>[r.name,r.current,r.maximum,r.detail]));

  spells.section('施法概况');
  spells.pairs([['施法属性',ABILITIES[d.castingAbility]||'—'],['法术攻击',d.spellcasting?.attackBonus??'—'],['法术DC',d.spellcasting?.saveDc??'—']]);
  spells.field('施法职业',classes);
  spells.row(['法术位',1,2,3,4,5,6,7,8,9],[3,1,1,1,1,1,1,1,1,1],'header');
  for(const [label,key] of [['现有','current'],['上限','maximum']])spells.row([label,...Array.from({length:9},(_,i)=>c.spellSlots?.[i+1]?.[key]??0)],[3,1,1,1,1,1,1,1,1,1]);
  if(c.pactSlots?.maximum)spells.field('契约法术位',`${c.pactSlots.level} 环　${c.pactSlots.current} / ${c.pactSlots.maximum}　短休或长休恢复`);
  spells.field('当前专注',c.spells?.find(s=>s.id===c.concentrationSpellId)?.name||'无');
  const ordered=orderSpellsForBook(c.spells||[]);
  spells.section('法术索引');
  spells.table(['序号','环阶','准备','法术名称','学派','施法时间','距离'],[1,1,1,3,2,2,2],ordered.map((s,i)=>[i+1,s.level,s.alwaysPrepared?'始终':yes(s.prepared),s.name||'未命名法术',s.school,s.castingTime,s.range]));
  spells.section('法术书');
  for(const [i,s] of ordered.entries()) {
    spells.section(`${i+1}. ${s.name||'未命名法术'}　${s.level===0?'戏法':s.level+'环'}${s.prepared?'　已准备':''}${s.alwaysPrepared?'　始终准备':''}`);
    spells.pairs([['学派',s.school],['施法时间',s.castingTime],['距离',s.range]]);
    spells.pairs([['持续时间',s.duration],['仪式',yes(s.ritual)],['专注',yes(s.concentration)]]);
    spells.field('成分', [s.verbal?'言语 V':'',s.somatic?'姿势 S':'',s.materialComponent?'材料 M':''].filter(Boolean).join('、'));
    spells.field('施法材料',s.material);spells.field('适用职业',s.classes);spells.field('来源',s.source);
    if(s.castingClassId)spells.field('所属施法职业',CLASSES[s.castingClassId]?.name||s.castingClassId);
    spells.row([s.effect||'未填写法术效果'],[12]);
  }

  if(!(c.deployedCreatures||[]).length)creatures.row(['尚未记录部署生物'],[12],'muted');
  for(const [i,b] of (c.deployedCreatures||[]).entries()) {
    if(i)creatures.breaks.push(creatures.rows.length);
    creatures.section(`${i+1}. ${b.name||'未命名生物'}`);
    const top=creatures.rows.length;
    const entries=[['种族',b.species],['阵营',b.alignment],['性别',b.sex],['类型',b.type],['体型',b.size],['现有 / 最大HP',`${b.currentHitPoints} / ${b.hitPoints}`],['HD / 临时HP',`${b.hitDice} / ${b.tempHitPoints}`],['AC / 先攻',`${b.armorClass} / ${b.initiative}`],['CR / 熟练',`${b.challengeRating} / ${b.proficiencyBonus}`],['速度',b.speed]];
    for(const [label,value] of entries)creatures.row([label,value,''],[2,6,4]);
    if(b.portrait)creatures.images.push({dataUrl:b.portrait,row:top,col:8,width:250,height:250});
    creatures.row(Object.values(ABILITIES),[2,2,2,2,2,2],'header');
    creatures.row(Object.keys(ABILITIES).map(id=>b.abilities?.[id]??''),[2,2,2,2,2,2]);
    for(const [label,key] of [['技能','skills'],['抗性','resistances'],['免疫','immunities'],['感官','senses'],['语言','languages'],['动作','actions'],['特质','traits'],['备注','notes']])creatures.field(label,b[key]);
  }

  inventory.section('钱币与负重');
  inventory.row(['铜币 cp','银币 sp','银金币 ep','金币 gp','铂金币 pp','钱币总重（磅）'],[2,2,2,2,2,2],'header');
  const coins=inventory.row(['cp','sp','ep','gp','pp'].map(key=>c.currency?.[key]??0).concat(d.load.coins),[2,2,2,2,2,2]);
  inventory.formula(coins,11,`SUM(A${coins},C${coins},E${coins},G${coins},I${coins})/50`,d.load.coins);
  inventory.pairs([['载重上限',d.load.capacity],['装备重量',d.load.equipment],['总负重',d.load.total]]);
  inventory.row(['重量单位为磅。装备重量沿用人物卡手填值；已穿装备若也记在背包，应由玩家避免重复计重。'],[12],'muted');
  inventory.section('物品清单');
  inventory.row(['名称','归类','数量','单重','总重','描述'],[3,1,1,1,1,5],'header');
  const weightCells=[];
  for(const item of c.inventory||[]) {
    const r=inventory.row([item.name,({quick:'速查',self:'自述',container:'容器'})[item.section]||item.section,item.quantity,item.weight,item.quantity*item.weight,item.description],[3,1,1,1,1,5]);
    inventory.formula(r,7,`E${r}*F${r}`,item.quantity*item.weight);weightCells.push(`G${r}`);
  }
  const total=inventory.row(['背包物品合计（磅）',d.load.inventory],[6,6],'total');
  inventory.formula(total,7,weightCells.length?`SUM(${weightCells.join(',')})`:'0',d.load.inventory);
  inventory.section('收支账簿');
  inventory.table(['类型','项目','说明','金额（gp）'],[1,3,6,2],(c.ledger||[]).map(x=>[x.kind==='expense'?'支出':'收入',x.project,x.detail,x.amount]));
  return {sheets,characterName:c.name,ruleset:c.ruleset};
}

function buildCocExcel(c){
  const d=deriveCoc(c),sheets=['调查员','技能','战斗','资产与物品','经历与神话'].map(name=>new Sheet(name,c));
  const [identity,skills,combat,items,journal]=sheets;
  identity.row(['当前调查员快照；编辑Excel不回写应用。完整恢复请同时保存JSON。'],[12],'muted');
  identity.section('调查员信息');
  for(const [label,key] of [['姓名','name'],['玩家','player'],['职业','occupation'],['时代','era'],['年龄','age'],['性别','gender'],['住地','residence'],['故乡','birthplace'],['游戏内时间','time']])identity.field(label,c[key]);
  if(c.portrait){identity.section('调查员肖像');const row=identity.rows.length;for(let i=0;i<10;i++)identity.row([''],[12],'body',27);identity.images.push({dataUrl:c.portrait,col:3,row,width:380,height:350});}
  identity.section('属性');identity.table(['属性','普通','困难','极难'],[6,2,2,2],Object.entries(ATTRIBUTES).map(([k,l])=>[l,c.attributes[k],Math.floor(c.attributes[k]/2),Math.floor(c.attributes[k]/5)]));
  identity.section('背景');for(const [key,label] of Object.entries({appearance:'形象描述',belief:'思想与信念',importantPeople:'重要之人',places:'意义非凡之地',treasures:'宝贵之物',traits:'特质',scars:'伤口和疤痕',phobias:'恐惧症和躁狂症',keyConnection:'关键背景联系',story:'背景故事',notes:'笔记'}))identity.field(label,c[key]);
  skills.field('本职技能',c.occupationNotes);skills.pairs([['职业剩余 / 总点数',`${d.occupationRemaining} / ${d.occupationPoints}`],['兴趣剩余 / 总点数',`${d.interestRemaining} / ${d.interestPoints}`],['成长合计',d.growth]]);
  skills.table(['技能','成长标','本职','初始','职业','兴趣','成长','普通','困难','极难'],[3,1,1,1,1,1,1,1,1,1],c.skills.map(s=>{const v=skillValue(c,s);return [skillName(s),s.checked?'是':'',s.occupational?'是':'',v.base,s.occupation,s.interest,s.growth,v.total,Math.floor(v.total/2),Math.floor(v.total/5)];}));
  combat.pairs([['生命',`${d.hp}/${d.hpMax}`],['理智',`${d.san}/${d.sanMax}`],['魔法',`${d.mp}/${d.mpMax}`]]);
  combat.pairs([['移动',d.mov],['伤害加值',d.db],['体格',d.build]]);combat.pairs([['生命状态',c.health],['理智状态',c.sanityState],['今日理智损失',c.sanLost]]);combat.pairs([['临时生命',c.tempHp],['重伤阈值',d.majorWound],['魔法每小时恢复',Math.floor(c.attributes.pow/100)+1]]);
  combat.section('武器');combat.table(['名称','技能','成功率','伤害','射程','贯穿','每轮','弹药','故障'],[2,2,1,2,1,1,1,1,1],c.weapons.map(w=>[w.name,w.skill,weaponChance(c,w)??'',w.damage,w.range,w.impale,w.attacks,w.ammo,w.malfunction]));
  combat.pairs([['防护物',c.armorName],['护甲减伤',c.armor],['覆盖部位',c.armorCoverage]]);combat.field('移动惩罚',c.applyArmorPenalty?c.armorPenalty:'未启用');
  items.pairs([['现金',c.cash??''],['其他资产',c.assets??''],['货币',c.currency]]);items.field('消费水平',c.spending??'');items.field('资产说明',c.assetNotes);items.field('载具',c.vehicleNotes);items.table(['物品','状态','部位 / 容器','数量','描述'],[3,1,2,1,5],c.items.map(r=>[r.name,r.state,r.location,r.quantity,r.description]));
  for(const [key,label,cols] of [['experiences','调查经历',['module','changes','notes']],['mythos','神话接触',['name','result','notes','loss']],['spells','法术',['name','cost','effect']],['companions','伙伴',['name','player','notes','changes','module']]]){journal.section(label);for(const row of c[key])journal.field(row.name||row.module||'记录',cols.filter(k=>k!=='name'&&(k!=='module'||key==='companions')).map(k=>row[k]).filter(Boolean).join('\n'));}
  journal.section('骰娘导入');journal.row([diceText(c)],[12]);
  return {sheets};
}
