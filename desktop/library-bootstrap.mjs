import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { openLibrary, librarySummary } from '../tools/library.mjs';
import { speciesRepairPending, repairSpecies } from '../tools/species-repair.mjs';

export function validateLibrary(filename) {
  const db = openLibrary(filename);
  if (!db) throw new Error('资料库文件不存在。');
  try {
    if (Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('资料库完整性检查失败。');
    for (const ruleset of ['dnd5e-2014', 'dnd5r-2024']) {
      const summary = librarySummary(db, { ruleset });
      if (!summary.sources.length || !summary.totalCells || !summary.kinds.some(row => row.count > 0)) {
        throw new Error(`资料库缺少 ${ruleset} 内容。`);
      }
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

// The bundled SQLite file stays outside ASAR. Never replace an existing user library.
export function bootstrapLibrary(bundledPath, userPath) {
  if (existsSync(userPath)) {
    if(!existsSync(bundledPath))return {source:'existing',path:userPath};
    const bundled=validateLibrary(bundledPath);
    const existing=validateLibrary(userPath);
    let additions, repairPending, textRepairs=[], textConflicts=[];
    try {
      const ids=new Set(existing.prepare('SELECT id FROM library_sources').all().map(row=>row.id));
      additions=bundled.prepare("SELECT id FROM library_sources WHERE id LIKE 'compendium-5e-%'").all().filter(row=>!ids.has(row.id));
      repairPending=speciesRepairPending(existing);
      if(bundled.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='library_content_repairs'").get()) {
        for(const fix of bundled.prepare(`SELECT r.* FROM library_content_repairs r JOIN library_entries e ON e.id=r.entry_id
          WHERE e.ruleset='dnd5e-2014' AND e.source_id LIKE 'compendium-5e-%'`).all()) {
          const row=existing.prepare('SELECT payload_json FROM library_entries WHERE id=?').get(fix.entry_id);
          if(!row) continue;
          const hash=createHash('sha256').update(row.payload_json).digest('hex');
          if(hash===fix.before_hash) textRepairs.push({...fix,previous:row.payload_json});
          else if(hash!==fix.after_hash) textConflicts.push(fix.entry_id);
        }
      }
    } finally {bundled.close();existing.close();}
    if(!additions.length&&!repairPending&&!textRepairs.length)return {source:'existing',path:userPath,textConflicts};
    const backup=`${userPath}.${Date.now()}.bak`;
    copyFileSync(userPath,backup,constants.COPYFILE_EXCL);
    const db=new DatabaseSync(userPath);
    try {
      db.exec('PRAGMA foreign_keys=ON');
      db.prepare('ATTACH DATABASE ? AS bundled').run(bundledPath);
      db.exec('BEGIN IMMEDIATE');
      for(const {id} of additions) {
        db.prepare('INSERT INTO library_sources SELECT * FROM bundled.library_sources WHERE id=?').run(id);
        db.prepare('INSERT INTO library_entries SELECT * FROM bundled.library_entries WHERE source_id=?').run(id);
        db.prepare('INSERT INTO library_entry_classifications SELECT c.* FROM bundled.library_entry_classifications c JOIN bundled.library_entries e ON e.id=c.entry_id WHERE e.source_id=?').run(id);
        db.prepare(`INSERT INTO library_taxonomy SELECT t.* FROM bundled.library_taxonomy t WHERE t.kind IN (SELECT kind FROM bundled.library_entries WHERE source_id=?)
          ON CONFLICT(kind) DO UPDATE SET domain=excluded.domain,label=excluded.label,capability=excluded.capability,warning=excluded.warning`).run(id);
      }
      for(const fix of textRepairs) {
        // Compare again inside the transaction; never replace user-edited content.
        db.prepare('UPDATE library_entries SET payload_json=? WHERE id=? AND payload_json=?').run(fix.payload_json,fix.entry_id,fix.previous);
      }
      db.exec('COMMIT');
      if(repairPending)repairSpecies(db);
    } catch(error) {if(db.isTransaction)db.exec('ROLLBACK');throw error;} finally{db.close();}
    return {source:'merged',path:userPath,backup,addedSources:additions.map(row=>row.id),repairedTexts:textRepairs.length,textConflicts};
  }
  validateLibrary(bundledPath).close();
  mkdirSync(path.dirname(userPath), { recursive: true });
  copyFileSync(bundledPath, userPath, constants.COPYFILE_EXCL);
  return { source: 'bundled', path: userPath };
}
