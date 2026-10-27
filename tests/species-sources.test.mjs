import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {searchLibrary,getLibraryEntry,librarySummary} from '../tools/library.mjs';
import {repairSpecies,speciesCandidates} from '../tools/species-repair.mjs';
import {classifySource} from '../tools/library-provenance.mjs';
const dbPath=new URL('../local-data/content-library.sqlite',import.meta.url);
test('all archived species choices are exposed; exact elf is first in both editions',()=>{
  const db=new DatabaseSync(dbPath,{readOnly:true});
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    for(const c of speciesCandidates(db).filter(c=>c.ruleset===ruleset)) {
      assert.ok(db.prepare("SELECT 1 FROM library_entries WHERE ruleset=? AND kind='species' AND name=?").get(ruleset,c.name),c.name);
    }
    const list=searchLibrary(db,{ruleset,kind:'species',query:'精灵',limit:8});
    assert.equal(list.results[0].name,'精灵');
  }
  assert.equal(searchLibrary(db,{kind:'species'}).total,106);
  assert.equal(searchLibrary(db,{kind:'species',ruleset:'dnd5r-2024'}).total,163);
  const elf=searchLibrary(db,{kind:'species',query:'精灵'}).results[0];
  assert.equal(elf.provenance.book,'玩家手册');
  db.close();
});
test('2024 choice index joins the family by name, not an unrelated stats row',()=>{
  const db=new DatabaseSync(dbPath,{readOnly:true});const ruleset='dnd5r-2024';
  const get=name=>getLibraryEntry(db,searchLibrary(db,{ruleset,kind:'species',query:name}).results[0].id,{ruleset}).payload;
  for(const name of ['高等精灵','木精灵','卓尔']) {const p=get(name);assert.equal(p.族系,'精灵');assert.match(p.体型,/5-6/);assert.equal(p.速度,'30尺');}
  assert.equal(get('歌利亚').速度,'35尺');
  assert.equal(get('战俑').族系,'战俑');
  for(const name of ['曼德拉','炎身','洁英'])assert.equal(get(name).速度,null);
  db.close();
});
test('book and source-group filters compose with edition and entry kind',()=>{
  const db=new DatabaseSync(dbPath,{readOnly:true});
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const result=searchLibrary(db,{ruleset,sourceGroup:'core',book:'玩家手册',kind:'spell'});
    assert.ok(result.total>0);assert.ok(result.results.every(e=>e.provenance.book==='玩家手册'&&e.provenance.group==='core'));
  }
  assert.equal(searchLibrary(db,{ruleset:'dnd5r-2024',kind:'reference',sourceGroup:'core'}).total,0);
  assert.ok(librarySummary(db).books.some(b=>b.book==='城主指南'&&b.sourceGroup==='core'));
  assert.equal(classifySource(null,{},'dnd5r-2024').group,'unknown');
  assert.equal(classifySource('谦卑林故事集',{},'dnd5r-2024').group,'third_party');
  assert.equal(classifySource('其他',{来源文件:'其他/UA/种族/精灵.html'},'dnd5e-2014').group,'playtest');
  assert.equal(classifySource('珊娜萨的万事指南',{},'dnd5r-2024').edition,'原书版本待核');
  db.close();
});
test('repair is idempotent and preserves customized species values',()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schemas/content-library.sql',import.meta.url),'utf8'));
  const source='5r-workbook-71aa1d52be39d246',ruleset='dnd5r-2024';
  db.prepare('INSERT INTO library_sources VALUES(?,?,?,?,?,?,?)').run(source,'test.xlsx','test',ruleset,'now','local_only','fixture');
  db.prepare('INSERT INTO library_sheets VALUES(?,?,?,?,?,?)').run(source,'种族','reference','visible',164,48);
  for(const [cell,v] of Object.entries({A5:'精灵',B5:4,C5:1,D5:5,A6:'卓尔',C6:6,D6:6,A7:'高等精灵',C7:7,D7:7,K8:'精灵',E5:'精灵',F5:'类人',G5:'中型',H5:'30尺',E6:'侏儒',F6:'类人',G6:'小型',H6:'30尺',E7:'歌利亚',F7:'类人',G7:'中型',H7:'35尺'}))
    db.prepare('INSERT INTO library_cells VALUES(?,?,?,?,?)').run(source,'种族',cell,JSON.stringify(v),null);
  const insert=db.prepare("INSERT INTO library_entries(id,source_id,ruleset,kind,name,source_sheet,source_range,payload_json) VALUES(?,?,?,'species',?,'种族',?,?)");
  insert.run(`${source}:种族:A6:H6:species`,source,ruleset,'卓尔','A6:H6',JSON.stringify({通用特性:'侏儒',生物种类:'类人',体型:'小型',速度:'30尺',我的备注:'保留'}));
  insert.run(`${source}:种族:A7:H7:species`,source,ruleset,'高等精灵','A7:H7',JSON.stringify({通用特性:'歌利亚',生物种类:'类人',体型:'中型',速度:'自定义速度'}));
  const report=repairSpecies(db);assert.equal(report.corrected5r,1);assert.equal(report.preservedCustom,1);
  const p=JSON.parse(db.prepare("SELECT payload_json FROM library_entries WHERE name='卓尔'").get().payload_json);
  assert.equal(p.通用特性,'精灵');assert.equal(p.我的备注,'保留');
  assert.equal(repairSpecies(db).alreadyApplied,true);db.close();
});
