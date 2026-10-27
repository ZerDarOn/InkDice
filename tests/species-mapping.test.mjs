import test from 'node:test';
import assert from 'node:assert/strict';
import {openLibrary,featureImports,searchLibrary} from '../tools/library.mjs';
import {switchSpeciesFeatures,syncSpeciesFeatures,speciesContext} from '../prototype/feature-import.mjs';
import {createCharacter,normalizeCharacter} from '../prototype/model.mjs';
const E='dnd5e-2014',R='dnd5r-2024';
const db=openLibrary(new URL('../local-data/content-library.sqlite',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
test.after(()=>db.close());
const get=c=>featureImports(db,{ruleset:E,kind:'species',context:JSON.stringify(c)});
const from=(species,book)=>{
 const pending=get({species}),choice=pending.sourceChoices?.[0];
 const ref=choice?.options.find(o=>o.label.startsWith(book));assert.ok(ref,`${species}: ${book}`);
 return get({species,speciesReferences:{[choice.name]:ref.id}});
};
test('all 106 5E catalog rows and every offered source resolve prose or an explicit grouping choice',()=>{
 const rows=db.prepare("SELECT id,name FROM library_entries WHERE ruleset=? AND kind='species'").all(E);
 assert.equal(rows.length,106);
 for(const row of rows) {
  const context={species:row.name,speciesEntryId:row.id};const r=get(context);
  const resolved=r.sourceChoices.length?r.sourceChoices.flatMap(s=>s.options.map(o=>get({...context,speciesReferences:{[s.name]:o.id}}))):[r];
  for(const result of resolved) {
   assert.ok(result.results.length || ['类地精','元素裔'].includes(row.name),row.name);
   assert.ok(!result.warnings.some(w=>/未找到|缺少|未能/.test(w)),row.name+result.warnings.join());
   assert.ok(result.results.every(e=>e.payload.描述.length>=5 && e.payload.来源参考条目 && e.ruleset===E),row.name);
   assert.ok(!result.results.some(e=>/^(你|尺内|岁左右|存在)|通常|寿命|引用|规则提醒|施法时间|施法距离/.test(e.name)),row.name);
  }
 }
});
test('5E old subraces never mix MotM or siblings, and variants replace rather than stack base grants',()=>{
 for(const name of ['地底侏儒_魔邓肯','灰矮人_魔邓肯','雅灵_魔邓肯','海精灵_魔邓肯','影灵_魔邓肯']) {
  const r=get({species:name});assert.ok(r.results.every(e=>e.sourceSheet.startsWith('玩家手册/')||e.sourceSheet.startsWith('魔邓肯的众敌卷册/')));
  assert.ok(r.results.length>=8,name);
 }
 for(const name of ['巴尔泽布','迪斯帕特','菲尔娜','格莱西雅']) {
  const r=get({species:name+'_魔邓肯'}).results;
  assert.ok(!r.some(e=>e.name==='地狱遗赠'||e.name==='属性值加成'));
  assert.equal(r.filter(e=>e.name==='属性值提升').length,1);
  assert.equal(r.filter(e=>e.name.includes('遗赠')).length,1);
 }
 const marks=get({species:'侦测龙纹_艾伯伦'}).results;
 assert.ok(!marks.some(e=>['多才多艺','属性值加成'].includes(e.name)));
 assert.ok(marks.find(e=>e.name==='龙纹法术').payload.描述.includes('通晓传奇'));
 for(const family of ['半兽人','人类']) {
  const r=get({species:family,subrace:'探索龙纹_艾伯伦'}).results;
  assert.ok(!r.some(e=>['坚韧不屈','凶蛮攻击','凶恶'].includes(e.name)));
  assert.equal(r.filter(e=>e.name==='语言').length,1);
 }
});
test('ancestry table, complete special prose, and optional traits are bounded correctly',()=>{
 assert.ok(get({species:'红龙裔'}).results.find(e=>e.name==='龙族血统：红龙').payload.描述.includes('火焰'));
 assert.ok(get({species:'岩侏儒'}).results.find(e=>e.name==='工匠学识').payload.描述.includes('双倍'));
 assert.ok(!get({species:'岩侏儒'}).results.some(e=>e.name==='地底侏儒'||e.name==='’'));
 assert.ok(!get({species:'山地矮人'}).results.some(e=>e.name==='灰矮人'));
 const legacy=get({species:'守护阿斯莫'}).results;
 assert.ok(legacy.some(e=>e.name==='光辉灵魂'));assert.ok(!legacy.some(e=>e.name==='光辉焚化'||e.name==='死灵环绕'));
 const shifter=get({species:'长牙化兽者'}).results;
 assert.ok(shifter.some(e=>e.name==='凶狠角色'));assert.ok(!shifter.some(e=>e.name==='野兽本能'));
 const modern=from('化兽者','多元宇宙').results;
 assert.ok(modern.find(e=>e.name==='化形').payload.描述.includes('下列选项中额外获得一项'));
 assert.ok(!modern.some(e=>e.name==='兽皮'));
 const aasimar=from('阿斯莫','多元宇宙').results;
 assert.ok(aasimar.find(e=>e.name==='天启').payload.描述.includes('光辉灵魂'));assert.ok(!aasimar.some(e=>e.name==='光辉灵魂'));
 assert.ok(get({species:'战俑（机关人）'}).results.some(e=>e.name==='年龄'&&e.payload.描述.includes('免疫魔法老化')));
 assert.ok(get({species:'巫咒之子'}).results.find(e=>e.name==='神秘信物').payload.描述.includes('遥远视野'));
 assert.ok(from('狗头人','瓦罗').results.find(e=>e.name==='猛虎落地势').payload.描述.includes('短休息'));
 assert.ok(get({species:'鼯猴人'}).results.find(e=>e.name==='滑翔').payload.描述.includes('反应'));
});
test('subrace dropdown stays within the chosen family, including duplicate named dragonmarks',()=>{
 const r=searchLibrary(db,{ruleset:E,kind:'species',speciesFor:'精灵',query:''});
 assert.ok(r.results.some(e=>e.name==='高等精灵'));
 assert.ok(!r.results.some(e=>e.speciesFamily!=='精灵'));
 const marks=searchLibrary(db,{ruleset:E,kind:'species',query:'探索龙纹'}).results;
 assert.deepEqual(new Set(marks.map(e=>e.speciesFamily)),new Set(['人类','半兽人']));
});
test('rabbit to elf to rabbit replaces active species and restores edited records after persistence',()=>{
 let c=createCharacter({ruleset:E,species:'兔人',featureEntries:[]});let id=0;
  const sync=()=>{switchSpeciesFeatures(c);return syncSpeciesFeatures(c,get({species:c.species,subrace:c.subrace}).results,()=>String(++id));};
 sync();const rabbit=c.featureEntries.find(f=>f.name==='兔子跳');rabbit.description='手改的兔子跳';rabbit.current=2;
 c.featureEntries.push({id:'class',kind:'class',name:'职业能力',description:'保留'});
 c.featureEntries.push({id:'manual',kind:'species',name:'我的兔人备注',description:'备注',speciesBinding:speciesContext(c)});
 c.species='精灵';sync();assert.ok(!c.featureEntries.some(f=>f.name.includes('兔')));assert.ok(c.featureEntries.some(f=>f.id==='class'));
 c=normalizeCharacter(c);assert.ok(c.speciesFeatureArchive.some(f=>f.description==='手改的兔子跳'));
 c.species='兔人';sync();assert.equal(c.featureEntries.find(f=>f.id===rabbit.id).description,'手改的兔子跳');
 assert.equal(c.featureEntries.find(f=>f.id===rabbit.id).current,2);assert.ok(c.featureEntries.some(f=>f.id==='manual'));
 assert.ok(!c.featureEntries.some(f=>f.name==='精类血统'));
 sync();assert.equal(c.featureEntries.filter(f=>f.catalogEntry?.kind==='species_feature').length,7);
});
test('legacy mixed species are migrated safely, handwritten unknown rows survive, and editions stay separated',()=>{
 for(const ruleset of [E,R]) {
  const c=createCharacter({ruleset,species:'精灵',featureEntries:[]});let id=0;
  for(const species of ['兔人','精灵']) for(const entry of featureImports(db,{ruleset,kind:'species',context:JSON.stringify({species})}).results)
   c.featureEntries.push({id:String(++id),kind:'species',name:entry.name,description:entry.payload.描述,catalogEntry:entry});
  c.featureEntries.push({id:'unknown',kind:'species',name:'旧手写',description:'不可猜测删除'});
  switchSpeciesFeatures(c);
  assert.ok(!c.featureEntries.some(f=>f.name==='兔子跳'));assert.ok(c.featureEntries.some(f=>f.id==='unknown'));
  assert.equal(c.speciesFeatureArchive.length,ruleset===E?7:4);
 }
});
test('changing source in place does not restore obsolete archived source on reimport',()=>{
 const c=createCharacter({ruleset:E,species:'狗头人',featureEntries:[]});let id=0;
 const old=from('狗头人','瓦罗').results,modern=from('狗头人','多元宇宙').results;
 switchSpeciesFeatures(c);syncSpeciesFeatures(c,old,()=>String(++id));
 syncSpeciesFeatures(c,modern,()=>String(++id));switchSpeciesFeatures(c);
 assert.ok(!c.featureEntries.some(f=>f.name==='群体战术'));
 syncSpeciesFeatures(c,modern,()=>String(++id));assert.equal(c.featureEntries.length,modern.length);
});
test('renaming an imported trait retains ownership even after catalog effects are detached',()=>{
 const c=createCharacter({ruleset:E,species:'兔人',featureEntries:[]});let id=0;
 switchSpeciesFeatures(c);const entries=get({species:'兔人'}).results;syncSpeciesFeatures(c,entries,()=>String(++id));
 const row=c.featureEntries.find(f=>f.name==='兔子跳');row.name='我的跳跃';row.catalogEntry=null;
 syncSpeciesFeatures(c,entries,()=>String(++id));assert.equal(c.featureEntries.length,7);assert.ok(!c.featureEntries.some(f=>f.name==='兔子跳'));
 c.species='人类';switchSpeciesFeatures(c);assert.ok(!c.featureEntries.some(f=>f.name==='我的跳跃'));
 c.species='兔人';switchSpeciesFeatures(c);syncSpeciesFeatures(c,entries,()=>String(++id));assert.equal(c.featureEntries.find(f=>f.id===row.id).name,'我的跳跃');
});
