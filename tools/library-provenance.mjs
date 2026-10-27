// Publication provenance is separate from the character's compatible ruleset.
const aliases = new Map(Object.entries({
  '塔莎的万象坩埚':'塔莎的万事坩埚','费茨本的巨龙宝库':'费资本的巨龙宝库',
  '斯翠海文：混乱之课':'斯翠海文：混沌研习','拉尼卡公会会长指南':'拉尼卡公会长指南',
  '星界冒险指南':'星界冒险者指南',
  '瓦罗怪物指南':'瓦罗的怪物指南','塞洛斯之神话奥德赛':'塞洛斯的神话奥德赛',
  '多元宇宙的怪物':'魔邓肯出品：多元宇宙的怪物','巨人之荣耀':'毕格比呈现：巨人之荣耀',
  '范·里希腾的鸦阁魔域指南':'范里希腾的鸦域指南',
  '莫提的位面游记':'莫提的位面大游行','艾奎兹玄有限责任公司':'艾奎兹玄公司',
}));
const core=new Set(['玩家手册','城主指南','怪物图鉴']);
const extensions=new Set(['珊娜萨的万事指南','塔莎的万事坩埚','费资本的巨龙宝库','斯翠海文：混沌研习','拉尼卡公会长指南','星界冒险者指南','剑湾冒险者指南','瓦罗的怪物指南','魔邓肯的众敌卷册','艾伯伦：从终末战争中崛起','荒洲探险家指南','艾奎兹玄公司','塞洛斯的神话奥德赛','范里希腾的鸦域指南','魔邓肯出品：多元宇宙的怪物','布布的奇械之书','毕格比呈现：巨人之荣耀','印记城与外域','莫提的位面大游行','万象无常书']);
export const SOURCE_GROUPS={core:'三宝书',extension:'官方扩展',adventure:'冒险/电子资源',third_party:'第三方',playtest:'测试材料 / UA',unknown:'来源待核'};
extensions.add('布布的星界怪兽展');
export function classifySource(book,payload,ruleset) {
  const p=typeof payload==='string'?JSON.parse(payload):payload||{};
  const raw=String(book||p.来源卷册||'').replace(/ · (第三方|测试材料|规则待核)$/,'').trim();
  const folder=String(p.来源文件||'').split('/')[1];
  const specific=['第三方','模组','其他'].includes(raw)&&folder&&!/\.html?$/.test(folder)?folder:raw;
  const sourceBook=aliases.get(specific)||specific||'未标注书籍';
  const evidence=[p.来源性质,p.规则世代,p.内容标记,p.来源文件].filter(Boolean).join(' ');
  let group='unknown';
  if(/第三方/.test(evidence)|| / · 第三方$/.test(book||'')||/^(塔尔多雷|德拉肯海姆|谦卑林|艾弗瑞斯)/.test(sourceBook))group='third_party';
  else if(/测试材料|\/UA\//.test(evidence)|| / · 测试材料$/.test(book||''))group='playtest';
  else if(core.has(sourceBook))group='core';
  else if(extensions.has(sourceBook)||/官方扩展/.test(evidence))group='extension';
  else if(/冒险内容|电子资源/.test(p.规则世代||''))group='adventure';
  // A 2024 workbook may contain 2014 publications. Never infer a book edition from compatibility alone.
  return {group,groupLabel:SOURCE_GROUPS[group],book:sourceBook,edition:p.规则世代||'原书版本待核',ruleset};
}
const registered=new WeakSet();
export function registerProvenance(db) {
  if(registered.has(db))return;
  db.function('source_meta',{deterministic:true},(book,payload,ruleset)=>JSON.stringify(classifySource(book,payload,ruleset)));
  registered.add(db);
}
