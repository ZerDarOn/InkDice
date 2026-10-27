import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { bootstrapLibrary } from '../desktop/library-bootstrap.mjs';
import { spellSections } from '../tools/import-5e-compendium.mjs';
import { searchLibrary,getLibraryEntry } from '../tools/library.mjs';
import { curioPatchFromEntry,spellPatchFromEntry } from '../prototype/suggestions.mjs';

const source=fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url));
const db=new DatabaseSync(source,{readOnly:true});
test.after(()=>db.close());

test('compendium text and separated magic item categories belong only to 2014',()=>{
  const counts=db.prepare("SELECT kind,count(*) n FROM library_entries WHERE source_id LIKE 'compendium-5e-%' GROUP BY kind").all();
  assert.deepEqual(Object.fromEntries(counts.map(row=>[row.kind,row.n])),{curio:277,magic_item:222,reference:4172,spell:17});
  assert.equal(db.prepare("SELECT count(*) n FROM library_entries WHERE source_id LIKE 'compendium-5e-%' AND ruleset!='dnd5e-2014'").get().n,0);
  assert.equal(searchLibrary(db,{ruleset:'dnd5r-2024',kind:'reference'}).total,0);
  assert.equal(searchLibrary(db,{ruleset:'dnd5r-2024',kind:'curio',query:'次元袋'}).total,0);
  assert.equal(searchLibrary(db,{kind:'item',query:'次元袋'}).total,0);
});

test('magic item details retain complete bounded text and require explicit attunement',()=>{
  const bag=getLibraryEntry(db,searchLibrary(db,{kind:'curio',query:'次元袋'}).results[0].id);
  assert.match(bag.payload.描述,/500磅/);
  assert.match(bag.payload.描述,/星界/);
  assert.doesNotMatch(bag.payload.描述,/这种普通布袋有三种/);
  const tome=getLibraryEntry(db,searchLibrary(db,{kind:'curio',query:'奥法秘典'}).results[0].id);
  assert.match(tome.payload.描述,/奥术回想/);
  assert.doesNotMatch(tome.payload.描述,/血源瓶/);
  assert.equal(tome.payload.需要同调,'是');
  const patch=curioPatchFromEntry(tome);
  assert.equal(patch.rarity,'非普通');assert.equal(patch.attuned,undefined);
  assert.throws(()=>curioPatchFromEntry({kind:'item'}));
});

test('reference keyword search finds body-only terms and source provenance',()=>{
  const results=searchLibrary(db,{kind:'reference',query:'500磅'});
  assert.ok(results.total>0);
  const detail=getLibraryEntry(db,results.results[0].id);
  assert.match(detail.payload.正文,/500磅/);
  assert.ok(detail.payload.来源文件);assert.ok(detail.payload.规则世代);
});

test('new spells retain third-party marking, edition, rank and compatible fill fields',()=>{
  const spell=getLibraryEntry(db,searchLibrary(db,{kind:'spell',query:'猎人视界',rank:0}).results[0].id);
  assert.match(spell.sourceBook,/第三方/);assert.equal(spell.payload.内容标记,'第三方');
  const patch=spellPatchFromEntry(spell);
  assert.equal(patch.level,0);assert.ok(patch.effect.length>20);assert.ok(patch.castingTime);
  assert.equal(searchLibrary(db,{kind:'spell',query:'猎人视界',rank:4}).total,0);
  assert.equal(searchLibrary(db,{ruleset:'dnd5r-2024',kind:'spell',query:'猎人视界'}).total,0);
});

test('spell parser separates bilingual name, fields and effect without assigning unknown metadata',()=>{
  const parsed=spellSections('#### 测试术 Test Spell\n\n一环 塑能（法师） 施法时间：1 动作 施法距离：30 尺 法术成分：V，S 持续时间：专注，至多一分钟 测试正文。');
  assert.equal(parsed.length,1);assert.equal(parsed[0].name,'测试术');assert.equal(parsed[0].englishName,'Test Spell');
  assert.equal(parsed[0].payload.持续时间,'专注，至多一分钟');assert.equal(parsed[0].payload.法术详述,'测试正文。');
  assert.deepEqual(parsed[0].payload.职业列表,['法师']);
  assert.deepEqual(spellSections('#### 不完整法术\n\n环阶未知，说明。'),[]);
});

test('upgrading an existing library adds source once, backs up and preserves edited workbook entries',()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'inkdice-compendium-upgrade-'));
  const target=path.join(folder,'library.sqlite');copyFileSync(source,target);
  const old=new DatabaseSync(target);
  old.exec("DELETE FROM library_entry_classifications WHERE entry_id IN (SELECT id FROM library_entries WHERE source_id LIKE 'compendium-5e-%'); DELETE FROM library_entries WHERE source_id LIKE 'compendium-5e-%'; DELETE FROM library_sources WHERE id LIKE 'compendium-5e-%';");
  const id=old.prepare("SELECT id FROM library_entries WHERE kind='spell' LIMIT 1").get().id;
  old.prepare('UPDATE library_entries SET name=? WHERE id=?').run('用户自改条目',id);old.close();
  const before=readFileSync(target);
  const result=bootstrapLibrary(source,target);
  assert.equal(result.source,'merged');assert.deepEqual(readFileSync(result.backup),before);
  const upgraded=new DatabaseSync(target,{readOnly:true});
  assert.equal(upgraded.prepare('SELECT name FROM library_entries WHERE id=?').get(id).name,'用户自改条目');
  assert.equal(searchLibrary(upgraded,{kind:'curio',query:'次元袋'}).total,1);
  upgraded.close();assert.equal(bootstrapLibrary(source,target).source,'existing');
});
