import test from 'node:test';
import assert from 'node:assert/strict';
import {openLibrary,featureImports,searchLibrary,getLibraryEntry,classOptions} from '../tools/library.mjs';
import {appendImportedFeatures} from '../prototype/feature-import.mjs';
import {entryEligibility} from '../prototype/character-rules.mjs';
import {normalizeCharacter,createCharacter} from '../prototype/model.mjs';
import {createAppHandler} from '../desktop/protocol.mjs';
import {fileURLToPath} from 'node:url';
const db=openLibrary(new URL('../local-data/content-library.sqlite',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
const E='dnd5e-2014',R='dnd5r-2024';
const get=(kind,context,ruleset=E)=>featureImports(db,{ruleset,kind,context:JSON.stringify(context)});
test.after(()=>db.close());
test('5E elf traits are bounded to the selected subrace, not lore or siblings',()=>{
 const base=get('species',{species:'精灵'}),high=get('species',{species:'精灵',subrace:'高等精灵'}),wood=get('species',{species:'精灵',subrace:'木精灵'});
 assert.equal(base.results.length,8);assert.deepEqual(base.warnings,[]);
 assert.equal(high.results.length,12);assert.equal(wood.results.length,12);
 assert.ok(high.results.some(e=>e.name==='戏法'));assert.ok(!wood.results.some(e=>e.name==='戏法'));
 assert.ok(wood.results.some(e=>e.name==='野性面具'));assert.ok(!high.results.some(e=>e.name==='野性面具'));
 assert.equal(new Set(high.results.map(e=>e.id)).size,12);
 assert.ok(high.results.every(e=>e.ruleset===E && e.payload.来源参考条目));
});
test('PHB human does not inherit variant human feats or ASI',()=>{
 const result=get('species',{species:'人类'});
 assert.deepEqual(result.warnings,[]);assert.ok(result.results.some(e=>e.name==='属性值加成'&&e.payload.描述.includes('全部属性')));
 assert.ok(!result.results.some(e=>e.name==='专长'));
});
test('variant human replaces the base ASI, and inline spell names stay inside racial traits',()=>{
 const variant=get('species',{species:'变体人类'});
 assert.deepEqual(variant.warnings,[]);
 assert.equal(variant.results.filter(e=>e.name==='属性值加成').length,1);
 assert.ok(variant.results.some(e=>e.name==='专长'));
 const tiefling=get('species',{species:'提夫林'}).results;
 assert.ok(!tiefling.some(e=>e.name==='黑暗术'));
 assert.ok(tiefling.find(e=>e.name==='地狱遗赠').payload.描述.includes('黑暗术'));
 assert.ok(get('species',{species:'龙裔'}).results.some(e=>e.name==='吐息武器'));
});
test('ambiguous species sources require a source selection and reject an unrelated reference',()=>{
 const pending=get('species',{species:'歌利亚'});
 assert.equal(pending.results.length,0);assert.ok(pending.sourceChoices[0].options.length>1);
 const choice=pending.sourceChoices[0].options.find(o=>o.label.startsWith('多元宇宙'));
 assert.ok(choice);
 const chosen=get('species',{species:'歌利亚',speciesReferences:{歌利亚:choice.id}});
 assert.ok(chosen.results.some(e=>e.name==='小型巨人'));assert.deepEqual(chosen.sourceChoices,[]);
 const invalid=get('species',{species:'歌利亚',speciesReferences:{歌利亚:get('species',{species:'精灵'}).results[0].payload.来源参考条目}});
 assert.equal(invalid.results.length,0);
});
test('5R elf uses workbook cells and chosen lineage only',()=>{
 const result=get('species',{species:'精灵',subrace:'高等精灵'},R);
 assert.equal(result.results.length,6);assert.deepEqual(result.warnings,[]);
 assert.ok(result.results.find(e=>e.name==='敏锐感官').payload.描述.includes('之一'));
 assert.ok(!result.results.some(e=>e.name==='属性值加成'));
 assert.ok(result.results.every(e=>e.sourceRange.startsWith('种族!')));
});
test('all 163 archived 5R species options have indexed trait text',()=>{
 for(const row of db.prepare("SELECT name FROM library_entries WHERE kind='species' AND ruleset=?").all(R)){
  const r=get('species',{species:row.name},R);assert.ok(r.results.length,row.name);assert.deepEqual(r.warnings,[],row.name);
 }
});
test('5E subclass imports respect class levels, including multiclass and later upgrades',()=>{
 const c={classId:'fighter',level:1,multiclasses:[{classId:'wizard',level:2,subclass:'预言学派 School of Divination'}]};
 const low=get('class',c).results;
 assert.ok(low.some(e=>e.name==='预兆'));assert.ok(!low.some(e=>e.name==='预言专家'));
 c.multiclasses[0].level=6;assert.ok(get('class',c).results.some(e=>e.name==='预言专家'));
 const sam=get('class',{classId:'fighter',level:20,subclass:'武士 Samurai'});
 assert.deepEqual(sam.warnings,[]);
 for(const name of ['附赠熟练项','战意','雅臣','不懈','燕返','生死流转']) assert.ok(sam.results.some(e=>e.name===name),name);
 const level7=get('class',{classId:'fighter',level:7,subclass:'武士 Samurai'}).results;
 assert.ok(!level7.some(e=>e.name==='生死流转'));assert.ok(level7.some(e=>e.name==='雅臣'));
});
test('5R subclass imports continue to use indexed workbook abilities',()=>{
 const option=db.prepare("SELECT payload_json FROM library_entries WHERE ruleset=? AND kind='class' AND name='法师'").get(R);
 const subclass=JSON.parse(option.payload_json).规则关联.subclasses[0].name;
 assert.ok(get('class',{classId:'wizard',level:20,subclass},R).results.some(e=>e.payload.规则关联.subclass===subclass));
});
test('missing, custom and mismatched sources produce honest feedback',()=>{
 assert.ok(get('species',{species:'自制种族'}).warnings.length);
 const bad=get('species',{species:'精灵',subrace:'丘陵矮人'});
 assert.ok(bad.warnings.length);assert.ok(!bad.results.some(e=>e.name==='矮人刚毅'));
 assert.ok(get('class',{classId:'wizard',level:20,subclass:'武士 Samurai'}).warnings.length);
 assert.deepEqual(get('class',{classId:'sorcerer',level:20,subclass:'神圣之魂 Divine Soul'}).warnings,[]);
 assert.throws(()=>get('species',{},'bad'),/规则版本/);
});
test('recovered Divine Soul prose includes every actual ability, table and recovery',()=>{
 const r=get('class',{classId:'sorcerer',level:20,subclass:'神圣之魂 Divine Soul'}).results.filter(e=>e.payload.规则关联?.subclass);
 assert.deepEqual(r.map(e=>[e.name,e.payload.规则关联.minLevel]),[['神圣魔法',1],['众神眷恩',1],['强效治疗',6],['异界光翼',14],['神赐痊愈',18]]);
 assert.match(r[0].payload.描述,/牧师.*法术列表/s);assert.match(r[0].payload.描述,/防护善恶/);
 assert.match(r[1].payload.描述,/2d4/);assert.match(r[1].payload.描述,/短休或长休/);
 assert.match(r[4].payload.描述,/最大生命值半数/);
});
test('rabbit traits are complete and searchable only for the current species and edition',()=>{
 const c={species:'兔人'},r=get('species',c);
 assert.deepEqual(r.warnings,[]);assert.deepEqual(r.results.map(e=>e.name),['生物种类','体型','速度','野兔敏锐','野兔感官','幸运步法','兔子跳']);
 assert.match(r.results.at(-1).payload.描述,/长休/);assert.match(r.results.at(-1).payload.描述,/五倍/);
 const options={ruleset:E,kind:'species_feature',context:JSON.stringify(c),query:'兔'};
 const search=searchLibrary(db,options);assert.equal(search.total,3);
 assert.equal(getLibraryEntry(db,search.results[0].id,options).name,search.results[0].name);
 assert.equal(getLibraryEntry(db,search.results[0].id,{...options,context:JSON.stringify({species:'精灵'})}),null);
 assert.equal(getLibraryEntry(db,search.results[0].id,{...options,ruleset:R}),null);
});
test('117 archived 5E subclass options have sourced prose; official imports do not use UA or third-party matches',()=>{
 let count=0;
 for(const cls of classOptions(db,{ruleset:E}).results) for(const sub of cls.payload.规则关联.subclasses){
  const r=get('class',{classId:cls.classId,level:20,subclass:sub.name}).results.filter(e=>e.payload.规则关联?.subclass===sub.name);
  assert.ok(r.length,sub.name);assert.ok(r.every(e=>e.payload.描述.length>=15),sub.name);
  assert.ok(r.every(e=>!/(?:\/UA\/|第三方|过时)/.test(e.sourceSheet)),sub.name);count++;
 }
 assert.equal(count,117);
 const war=get('class',{classId:'cleric',level:1,subclass:'战争领域 War Domain'}).results;
 assert.ok(war.some(e=>e.name==='战争祭司'));assert.ok(!war.some(e=>e.name==='定制你的出身'));
});
test('subfeature choices stay with parent, and levels use prose when the source table disagrees',()=>{
 const battle=get('class',{classId:'fighter',level:3,subclass:'战斗大师 Battle Master'}).results;
 assert.ok(battle.find(e=>e.name==='卓越战技').payload.描述.includes('卓越骰'));
 assert.ok(!battle.some(e=>['卓越骰','战技'].includes(e.name)));
 const rune=get('class',{classId:'fighter',level:20,subclass:'符文骑士 Rune Knight'}).results;
 assert.ok(!rune.some(e=>e.name==='山丘符文'));
 assert.ok(rune.filter(e=>e.name.startsWith('符文雕刻者')).some(e=>e.payload.描述.includes('山丘符文')));
 const hunter=get('class',{classId:'ranger',level:3,subclass:'怪物杀手 Monster Slayer'}).results;
 assert.ok(hunter.some(e=>e.name==='狩猎开始'));
 const archer=get('class',{classId:'fighter',level:20,subclass:'魔射手 Arcane Archer'}).results;
 assert.ok(archer.some(e=>e.name==='注魔箭矢'));assert.ok(!archer.some(e=>e.name==='爆裂矢'));
 for(const [sub,name,level] of [['剑咏传承 Bladesinging','剑歌',2],['幻术学派 School of Illusion','易变幻象',6],['惑控学派 School of Enchantment','直觉魅惑',6]]) {
  assert.ok(get('class',{classId:'wizard',level,subclass:sub}).results.some(e=>e.name===name),name);
 }
});
test('reimport refreshes untouched older text but never hand-written descriptions',()=>{
 const entry=get('species',{species:'兔人'}).results.at(-1);
 const c={ruleset:E,featureEntries:[]};appendImportedFeatures(c,[entry],'species',()=> 'one');
 c.featureEntries[0].description='旧提取文本';c.featureEntries[0].catalogEntry={...c.featureEntries[0].catalogEntry,payload:{...entry.payload,描述:'旧提取文本'}};
 assert.equal(appendImportedFeatures(c,[entry],'species',()=> 'two').updated,1);
 c.featureEntries[0].description='手写保留';assert.equal(appendImportedFeatures(c,[entry],'species',()=> 'two').updated,0);
 assert.equal(c.featureEntries[0].description,'手写保留');
});
test('repeat imports preserve player edits and counters, and survive normalization',()=>{
 const c=createCharacter({ruleset:E});c.featureEntries=[];
 const entries=get('species',{species:'精灵'}).results;let id=0;
 assert.equal(appendImportedFeatures(c,entries,'species',()=>String(++id)).added,8);
 c.featureEntries[0].name='玩家改名';c.featureEntries[0].description='玩家改过';c.featureEntries[0].current=2;
 assert.equal(appendImportedFeatures(c,entries,'species',()=>String(++id)).added,0);
 const saved=normalizeCharacter(c);assert.equal(saved.featureEntries[0].description,'玩家改过');assert.equal(saved.featureEntries[0].current,2);
 assert.equal(appendImportedFeatures(c,get('species',{species:'精灵'},R).results,'species',()=>String(++id)).added,0);
});
test('manual records are preserved, full card capacity reports unimported count',()=>{
 const entries=get('species',{species:'精灵'}).results;
 const c={ruleset:E,featureEntries:[{kind:'species',name:'黑暗视觉',description:'手填'}]};let i=0;
 assert.equal(appendImportedFeatures(c,entries,'species',()=>String(++i)).skipped,1);
 c.featureEntries=Array.from({length:120},(_,i)=>({kind:'species',name:String(i)}));
 assert.equal(appendImportedFeatures(c,entries,'species',()=>String(++i)).overflow,8);
});
test('old species source effects stop when species or subrace changes',()=>{
 const entry=get('species',{species:'精灵',subrace:'高等精灵'}).results.find(e=>e.name==='戏法');
 assert.equal(entryEligibility(entry,{ruleset:E,species:'精灵',subrace:'木精灵',classId:'fighter',level:1}).status,'blocked');
});
test('desktop protocol exposes the same offline imports as the browser API',async()=>{
 const handler=createAppHandler(fileURLToPath(new URL('..',import.meta.url)),()=>db);
 const response=await handler(new Request('inkdice://app/api/library/features?'+new URLSearchParams({ruleset:E,kind:'species',context:JSON.stringify({species:'精灵'})})));
 assert.equal(response.status,200);assert.equal((await response.json()).results.length,8);
 for(const ruleset of [E,R]) {
  const params=new URLSearchParams({ruleset,kind:'species_feature',query:'兔子',context:JSON.stringify({species:'兔人'})});
  const search=await handler(new Request('inkdice://app/api/library/search?'+params));
  assert.equal(search.status,200);const entries=(await search.json()).results;assert.ok(entries.length);
  params.set('id',entries[0].id);const detail=await handler(new Request('inkdice://app/api/library/entry?'+params));
  assert.equal(detail.status,200);assert.ok((await detail.json()).payload.描述.includes('长休'));
 }
});
