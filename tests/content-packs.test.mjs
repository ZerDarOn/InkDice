import test from 'node:test';import assert from 'node:assert/strict';
import {PackRegistry,validatePack,extendedLibraryRequest,PACK_KEY} from '../prototype/content-packs.mjs';
import {testAiConnection} from '../tools/ai-test.mjs';
import {cocLibraryRequest} from '../prototype/coc/library.mjs';
import {spellPatchFromEntry} from '../prototype/suggestions.mjs';
import {exportCharacterXlsx} from '../prototype/excel-export.mjs';
import {createCharacter} from '../prototype/model.mjs';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const pack=()=>({format:'inkdice-content-pack',schemaVersion:1,id:'test',name:'团内资料',author:'测试',version:'1',entries:[{id:'spark',ruleset:'dnd5e-2014',kind:'spell',rank:0,name:'测试火花',payload:{职业列表:['法师'],法术详述:'测试内容'}}]});
test('strict data-only packs reject scripts, effects, duplicates and mixed protocols',()=>{
  assert.equal(validatePack(pack()).entries.length,1);
  for(const mutate of [p=>p.script='evil()',p=>p.entries.push(p.entries[0]),p=>p.entries[0].ruleset='unknown',p=>p.entries[0].payload.规则关联={effects:[]},p=>p.entries[0].rank=10,p=>p.entries[0].payload.职业列表=[],p=>p.entries[0].ruleset='coc-7e']){const p=pack();mutate(p);assert.throws(()=>validatePack(p));}
  const raw=JSON.parse(JSON.stringify(pack()).replace('"职业列表"','"__proto__"'));assert.throws(()=>validatePack(raw));
});
test('install toggle remove and reload are atomic; copied card values survive',()=>{
  const storage=memory(),r=new PackRegistry(storage);r.install(pack());assert.throws(()=>r.install(pack()));
  assert.equal(new PackRegistry(storage).entries('dnd5e-2014').length,1);assert.equal(r.entries('dnd5r-2024').length,0);
  const card=structuredClone(r.entries('dnd5e-2014')[0]);r.enable('test',false);assert.equal(r.entries('dnd5e-2014').length,0);r.enable('test',true);r.remove('test');assert.equal(card.name,'测试火花');assert.equal(new PackRegistry(storage).packs.length,0);
  storage.setItem=()=>{throw Error('quota')};assert.throws(()=>r.install(pack()));assert.equal(r.packs.length,0);
});
test('malformed stored registry is preserved, never silently overwritten',()=>{
  const storage=memory();storage.setItem(PACK_KEY,'{broken');const r=new PackRegistry(storage);assert.ok(r.warning);assert.throws(()=>r.install(pack()));assert.equal(storage.getItem(PACK_KEY),'{broken');
});
test('catalog merges pagination, class/rank/book filters and disabled entry lookup',async()=>{
  const r=new PackRegistry(memory());const p=pack();p.entries.push({...p.entries[0],id:'other',name:'其他火花'});r.install(p);
  const base=async path=>{const q=new URL(path,'http://local').searchParams;return {ruleset:'dnd5e-2014',total:4,results:['a','b','c','d'].slice(Number(q.get('offset')),Number(q.get('offset'))+Number(q.get('limit'))).map(id=>({id}))};};
  const request=params=>extendedLibraryRequest('/api/library/search?'+new URLSearchParams({ruleset:'dnd5e-2014',limit:'3',...params}),base,r);
  assert.deepEqual((await request({})).results.map(e=>e.id),['pack:test:spark','pack:test:other','a']);
  assert.deepEqual((await request({offset:'3'})).results.map(e=>e.id),['b','c','d']);
  assert.equal((await request({rank:'1'})).total,4);
  assert.equal((await request({book:'另一书'})).total,4);
  assert.equal((await request({context:JSON.stringify({ruleset:'dnd5e-2014',classId:'cleric',level:5,multiclasses:[]})})).total,4);
  const path='/api/library/entry?ruleset=dnd5e-2014&id=pack:test:spark';assert.equal((await extendedLibraryRequest(path,base,r)).name,'测试火花');r.enable('test',false);await assert.rejects(()=>extendedLibraryRequest(path,base,r));
});
test('pending catalog requests cannot resurrect a disabled pack',async()=>{
  const r=new PackRegistry(memory());r.install(pack());let finish;const pending=extendedLibraryRequest('/api/library/search?ruleset=dnd5e-2014',()=>new Promise(resolve=>finish=resolve),r);r.enable('test',false);finish({total:0,results:[]});await assert.rejects(pending);
});
test('AI probe rejects blank content, blocks redirects and redacts echoed keys',async()=>{
  const profile={baseUrl:'https://example.test/v1',model:'test',apiKey:'synthetic-only-key'};
  assert.equal((await testAiConnection(profile,async(_u,options)=>{assert.equal(options.redirect,'error');return Response.json({choices:[{message:{content:'  '}}]});})).ok,false);
  const denied=await testAiConnection(profile,async()=>Response.json({error:{message:'Invalid '+profile.apiKey}},{status:401}));assert.ok(!denied.message.includes(profile.apiKey));
  const failure=await testAiConnection(profile,async()=>{throw Error(profile.apiKey)});assert.ok(!failure.message.includes(profile.apiKey));
});
test('CoC book and source filters exclude the workbook from extension-only results',async()=>{
  const r=new PackRegistry(memory());r.install({...pack(),entries:[{id:'coc',ruleset:'coc-7e',kind:'weapon',name:'测试武器',payload:{伤害:'1D6'}}]});
  const result=await extendedLibraryRequest('/api/library/search?ruleset=coc-7e&book='+encodeURIComponent('团内资料'),cocLibraryRequest,r);assert.equal(result.total,1);assert.equal(result.results[0].name,'测试武器');
  const summary=await extendedLibraryRequest('/api/library/summary?ruleset=coc-7e',cocLibraryRequest,r);assert.equal(summary.extensionEntries,1);assert.equal(summary.totalCells,1106);
});
test('boolean spell flags remain explicit false when brought in from a pack',()=>{
  const entry={kind:'spell',rank:0,name:'test',payload:{仪式:false,专注:false,'V 言语':true,'M 材料':false}};const patch=spellPatchFromEntry(entry);assert.equal(patch.ritual,false);assert.equal(patch.materialComponent,false);assert.equal(patch.verbal,true);
});
test('all three systems export unobtrusive InkDice footer branding',async()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024','coc-7e']){const zip=await globalThis.JSZip.loadAsync(await exportCharacterXlsx(createCharacter({ruleset})));for(const entry of Object.values(zip.files).filter(f=>/^xl\/worksheets\/sheet\d+\.xml$/.test(f.name))){const xml=await entry.async('string');assert.ok(xml.includes('&amp;C墨骰工坊 · InkDice&amp;R'));}}
});
