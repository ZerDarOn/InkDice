import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSpellIndexRow} from '../prototype/spell-index.mjs';
import {orderSpellsForBook,createCharacter,exportDocument,importDocument} from '../prototype/model.mjs';

test('spell directory has one navigation button and no editing controls',()=>{
  const html=renderSpellIndexRow({id:'spell-a',name:'火球术',level:3,prepared:true},0,'spell-a');
  assert.equal((html.match(/<button\b/g)||[]).length,1);
  assert.doesNotMatch(html,/<(?:input|textarea|select|details)\b|data-record-field|data-suggest-kind/);
  assert.match(html,/aria-current="true"/); assert.match(html,/3 环/); assert.match(html,/已备/);
});
test('spell directory escapes user text and retains a readable unnamed state',()=>{
  assert.match(renderSpellIndexRow({id:'a',name:'<img>',level:0,prepared:false},0,'b'),/&lt;img&gt;/);
  const blank=renderSpellIndexRow({id:'b',name:'',level:0,prepared:false},1,'b');
  assert.match(blank,/未命名法术/);assert.match(blank,/戏法/);assert.match(blank,/未备/);
});
test('preparing or changing rank on the book preserves selection id and index ordering through export',()=>{
  const c=createCharacter({spells:[{id:'a',name:'甲',level:1},{id:'b',name:'乙',level:3},{id:'c',name:'丙',level:0}]});
  c.spells[1].prepared=true;
  c.spells[1].level=2;
  const saved=importDocument(exportDocument(c));
  assert.deepEqual(orderSpellsForBook(saved.spells).map(s=>s.name),['乙','丙','甲']);
  assert.match(renderSpellIndexRow(saved.spells[1],0,saved.spells[1].id),/2 环/);
});
