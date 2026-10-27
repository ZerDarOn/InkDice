import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapLibrary, validateLibrary } from '../desktop/library-bootstrap.mjs';
import { librarySummary } from '../tools/library.mjs';

const source = fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url));
const temp = mkdtempSync(path.join(os.tmpdir(),'inkdice-library-test-'));

test('first launch copies the bundled library with both editions intact',()=>{
  const target=path.join(temp,'new-profile/content-library.sqlite');
  assert.equal(bootstrapLibrary(source,target).source,'bundled');
  assert.deepEqual(readFileSync(target),readFileSync(source));
  const db=validateLibrary(target);
  try { for(const ruleset of ['dnd5e-2014','dnd5r-2024']) assert.ok(librarySummary(db,{ruleset}).totalCells>10000); }
  finally { db.close(); }
});

test('existing user library is never replaced even when bundled library is missing',()=>{
  const target=path.join(temp,'existing.sqlite');
  writeFileSync(target,'existing user data');
  assert.equal(bootstrapLibrary('missing-bundle.sqlite',target).source,'existing');
  assert.equal(readFileSync(target,'utf8'),'existing user data');
});

test('missing or corrupt bundled library fails before creating a user library',()=>{
  const target=path.join(temp,'failed-profile/library.sqlite');
  assert.throws(()=>bootstrapLibrary('missing-bundle.sqlite',target));
  const invalid=path.join(temp,'invalid.sqlite');
  writeFileSync(invalid,'not a database');
  assert.throws(()=>bootstrapLibrary(invalid,target));
  assert.equal(existsSync(target),false);
});
test('existing libraries receive only hash-matched text repairs, keep edits, back up and remain idempotent',()=>{
 const bundle=path.join(temp,'repair-bundle.sqlite'),target=path.join(temp,'repair-user.sqlite');
 copyFileSync(source,bundle);copyFileSync(source,target);
 const b=new DatabaseSync(bundle),u=new DatabaseSync(target);
 const rows=b.prepare("SELECT id,payload_json FROM library_entries WHERE ruleset='dnd5e-2014' AND kind='reference' AND source_id LIKE 'compendium-5e-%' LIMIT 2").all();
 const sha=s=>createHash('sha256').update(s).digest('hex');
 b.exec('DELETE FROM library_content_repairs');
 for(const [i,row] of rows.entries()) {
  const prior=JSON.stringify({...JSON.parse(row.payload_json),正文:'旧提取正文'});
  b.prepare('INSERT INTO library_content_repairs VALUES (?,?,?,?,?)').run(row.id,sha(prior),sha(row.payload_json),row.payload_json,'test');
  u.prepare('UPDATE library_entries SET payload_json=? WHERE id=?').run(i===0?prior:JSON.stringify({...JSON.parse(prior),正文:'用户修订'}),row.id);
 }
 b.close();u.close();
 const result=bootstrapLibrary(bundle,target);assert.equal(result.repairedTexts,1);assert.ok(existsSync(result.backup));assert.deepEqual(result.textConflicts,[rows[1].id]);
 const check=new DatabaseSync(target,{readOnly:true});
 assert.equal(check.prepare('SELECT payload_json FROM library_entries WHERE id=?').get(rows[0].id).payload_json,rows[0].payload_json);
 assert.equal(JSON.parse(check.prepare('SELECT payload_json FROM library_entries WHERE id=?').get(rows[1].id).payload_json).正文,'用户修订');check.close();
 assert.equal(bootstrapLibrary(bundle,target).source,'existing');
});
