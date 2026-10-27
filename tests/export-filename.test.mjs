import test from 'node:test';
import assert from 'node:assert/strict';
import { characterExportBasename } from '../prototype/export-filename.mjs';
test('Both editions export character-name then player-name without a ruleset suffix',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024'])assert.equal(characterExportBasename({name:'烬羽',player:'小李',ruleset}),'烬羽-小李');
});
test('Missing names have explicit safe fallbacks',()=>{
  assert.equal(characterExportBasename({}),'未命名角色-未填写玩家');
  assert.equal(characterExportBasename({name:' 烬羽 ',player:'  '}),'烬羽-未填写玩家');
});
test('Windows-invalid characters and trailing dots are sanitized',()=>{
  assert.equal(characterExportBasename({name:'烬/羽',player:'玩家:甲...'}),'烬_羽-玩家_甲');
  assert.ok(characterExportBasename({name:'名'.repeat(100),player:'玩'.repeat(100)}).length<=161);
});
