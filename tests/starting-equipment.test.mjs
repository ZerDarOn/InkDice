import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createCharacter,normalizeCharacter } from '../prototype/model.mjs';
import { classOptions } from '../tools/library.mjs';
import { startingEquipmentBlueprint,startingEquipmentPlan,applyStartingEquipment,undoStartingEquipment } from '../prototype/starting-equipment.mjs';
import { catalogUnitWeight,itemPatchFromEntry } from '../prototype/suggestions.mjs';
const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
test('actual 5R ammo bundles convert to single-projectile weight; 5E already has unit weights',()=>{
  for(const [ruleset,name,expected] of [['dnd5r-2024','箭矢',0.05],['dnd5r-2024','弩矢',0.075],['dnd5r-2024','枪械子弹',0.2],['dnd5r-2024','投石索子弹',0.075],['dnd5e-2014','箭',0.05],['dnd5e-2014','弩矢',0.075]]) {
    const row=db.prepare('SELECT * FROM library_entries WHERE ruleset=? AND kind=? AND name=?').get(ruleset,'item',name);row.payload=JSON.parse(row.payload_json);
    assert.equal(catalogUnitWeight(row),expected);assert.equal(itemPatchFromEntry(row).weight,expected);
  }
  assert.equal(catalogUnitWeight({kind:'item',ruleset:'dnd5r-2024',payload:{重量:1,描述:'箭袋可放20支箭'}}),1);
});
const entry=c=>({...classOptions(db,{ruleset:c.ruleset}).results.find(x=>x.classId===c.classId),ruleset:c.ruleset});
const select=(c,e,...branches)=>{const b=startingEquipmentBlueprint(c,e);c.startingEquipmentChoices[b.key]={branches,replacements:{},confirmRestrictions:true};return b;};
test('all thirteen imported initial classes in each edition expose complete exclusive branches',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) for(const e of classOptions(db,{ruleset}).results) {
    const c=createCharacter({ruleset,classId:e.classId}),b=startingEquipmentBlueprint(c,{...e,ruleset});
    assert.ok(b.key,`${ruleset} ${e.name}`);assert.ok(b.groups.length);assert.equal(b.review,'');
    assert.ok(startingEquipmentPlan(c,{...e,ruleset}).errors.length);
  }
});
test('5R fighter A B C have separate correct money and quantity totals',()=>{
  const c=createCharacter({classId:'fighter'}),e=entry(c);
  for(const [branch,gp,weapon,quantity] of [['A',4,'标枪',8],['B',11,'箭矢',20],['C',155,null,0]]) {
    select(c,e,branch);const p=startingEquipmentPlan(c,e);assert.deepEqual(p.errors,[]);assert.equal(p.gp,gp);
    if(weapon) assert.equal(p.items.find(x=>x.name===weapon).quantity,quantity);else assert.deepEqual(p.items,[]);
    assert.ok(!p.items.some(x=>/GP|或者/.test(x.name)));
  }
});
test('5E rogue keeps fixed armor, two daggers, thieves tools plus each chosen branch',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'rogue'}),e=entry(c);select(c,e,'A','A','C');
  const p=startingEquipmentPlan(c,e);assert.deepEqual(p.errors,[]);assert.equal(p.gp,0);
  for(const [name,q] of [['皮甲',1],['匕首',2],['盗贼工具',1],['刺剑',1],['短弓',1],['箭袋',1],['箭',20],['探索套装',1]]) assert.equal(p.items.find(x=>x.name===name)?.quantity,q,name);
});
test('generic choices are not issued as imaginary equipment; each quantity requires concrete selection',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'fighter'}),e=entry(c);select(c,e,'A','B','B','A');
  let p=startingEquipmentPlan(c,e);assert.equal(p.pending.length,2);assert.ok(p.errors.length);
  for(const [i,item] of p.pending.entries()) c.startingEquipmentChoices[p.key].replacements[item.id]=['长剑','长弓'][i];
  p=startingEquipmentPlan(c,e);assert.deepEqual(p.errors,[]);assert.ok(p.items.some(x=>x.name==='长剑'));assert.ok(p.items.some(x=>x.name==='长弓'));
});
test('conditions remain explicit and 5R monk tool/instrument must be named',()=>{
  const c=createCharacter({classId:'monk'}),e=entry(c);select(c,e,'A');
  let p=startingEquipmentPlan(c,e);assert.equal(p.pending.length,1);assert.ok(p.errors.length);
  c.startingEquipmentChoices[p.key].replacements[p.pending[0].id]='长笛';p=startingEquipmentPlan(c,e);assert.deepEqual(p.errors,[]);assert.equal(p.gp,11);
});
test('issuance preserves manual inventory, never auto-equips, blocks duplicates across editions, and roundtrips undo',()=>{
  let c=createCharacter({classId:'fighter',currency:{gp:6},inventory:[{id:'old',name:'私人物品',quantity:1,weight:2}]}),e=entry(c);select(c,e,'A');
  assert.throws(()=>applyStartingEquipment(c,e),/确认/);const armor=c.armorId;
  applyStartingEquipment(c,e,{confirmed:true});assert.equal(c.currency.gp,10);assert.equal(c.armorId,armor);assert.equal(c.inventory[0].name,'私人物品');
  assert.match(c.inventory[1].description,/重量待核对/);assert.throws(()=>applyStartingEquipment(c,e,{confirmed:true}),/领取过/);
  c=normalizeCharacter(c);undoStartingEquipment(c);assert.equal(c.currency.gp,6);assert.equal(c.inventory.length,1);
  select(c,e,'C');applyStartingEquipment(c,e,{confirmed:true});c.ruleset='dnd5e-2014';const ee=entry(c);select(c,ee,'A','B','B','A');assert.throws(()=>applyStartingEquipment(c,ee,{confirmed:true}),/领取过/);
});
test('undo refuses spent money or changed/deleted items without partial mutation',()=>{
  const c=createCharacter({classId:'fighter'}),e=entry(c);select(c,e,'A');applyStartingEquipment(c,e,{confirmed:true});
  c.currency.gp--;let before=JSON.stringify(c);assert.throws(()=>undoStartingEquipment(c),/已有变动/);assert.equal(JSON.stringify(c),before);
  c.currency.gp++;c.inventory[0].quantity=0;before=JSON.stringify(c);assert.throws(()=>undoStartingEquipment(c),/已有变动/);assert.equal(JSON.stringify(c),before);
});
test('wrong version or wrong primary class cannot issue and invalid choice state is bounded',()=>{
  const c=createCharacter({classId:'fighter'}),e=entry(c);select(c,e,'A');assert.equal(startingEquipmentBlueprint({...c,classId:'wizard'},e),null);
  const before=JSON.stringify(c);assert.throws(()=>applyStartingEquipment(c,{...e,ruleset:'dnd5e-2014'},{confirmed:true}),/不匹配/);assert.equal(JSON.stringify(c),before);
  const normalized=normalizeCharacter({...c,startingEquipmentChoices:JSON.parse('{"__proto__":{"branches":["A"]}}')});assert.deepEqual(normalized.startingEquipmentChoices,{});
});
