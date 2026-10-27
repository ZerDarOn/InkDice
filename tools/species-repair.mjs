// Reconstruct choices from the archived workbook, never from a row-position join.
export const SPECIES_REPAIR = 'species-index-2026-10-26-v1';
const sources = { 'dnd5e-2014': '5e-workbook-398c2564a17f5242', 'dnd5r-2024': '5r-workbook-71aa1d52be39d246' };
const text = value => typeof value === 'string' ? value.trim() : '';
function cells(db, source, sheet) {
  return new Map(db.prepare('SELECT address,value_json FROM library_cells WHERE source_id=? AND sheet_name=?').all(source,sheet).map(r=>[r.address,JSON.parse(r.value_json)]));
}
export function speciesRepairPending(db) {
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='library_repairs'").get() && db.prepare('SELECT 1 FROM library_repairs WHERE id=?').get(SPECIES_REPAIR)) return false;
  return Boolean(db.prepare('SELECT 1 FROM library_cells WHERE source_id IN (?,?) LIMIT 1').get(...Object.values(sources)));
}
export function speciesCandidates(db) {
  const result=[];
  for(const [ruleset,source] of Object.entries(sources)) {
    if(!db.prepare('SELECT 1 FROM library_sources WHERE id=?').get(source)) continue;
    if(ruleset==='dnd5e-2014') {
      const m=cells(db,source,'图表');
      for(let n=59;n<=104;n++) {
        const name=text(m.get(`BQ${n}`)); if(!name)continue;
        const coreRef=db.prepare("SELECT id FROM library_entries WHERE ruleset=? AND kind='reference' AND source_book='玩家手册' AND name=?").get(ruleset,name);
        result.push({source,ruleset,name,sheet:'图表',range:`BQ${n}`,payload:{族系:name,选项层级:'基础种族',...(coreRef?{来源卷册:'玩家手册',规则世代:'2014规则体系',来源参考条目:coreRef.id}:{}),说明:'原表 BQ 基础种族选项；亚种单独选择，不自动授予完整特性。'}});
      }
    } else {
      const m=cells(db,source,'种族');
      const stats=new Map([...m].filter(([a,v])=>/^E\d+$/.test(a)&&text(v)).map(([a,v])=>[text(v),Number(a.slice(1))]));
      let family='', index=null;
      for(let n=2;n<=164;n++) {
        const name=text(m.get(`A${n}`));if(!name)continue;
        if(Number.isInteger(m.get(`B${n}`))) {index=m.get(`B${n}`);family=text(m.get(`K${index*2}`));}
        if(!family)throw new Error(`种族 A${n} 没有族系索引`);
        const statRow=stats.get(family);
        const payload={通用特性:family,生物种类:statRow?m.get(`F${statRow}`)??null:null,体型:statRow?m.get(`G${statRow}`)??null:null,速度:statRow?m.get(`H${statRow}`)??null:null,
          族系:family,选项层级:name===family?'基础种族':'亚种/血统选项',
          来源索引:`A${n}:D${n} → K${index*2}${statRow?` → E${statRow}:H${statRow}`:''}`,
          特性索引:{行:index,起列:m.get(`C${n}`),止列:m.get(`D${n}`)},
          说明:statRow?'数值为族系通用信息；亚种的速度覆盖、血统选择等见特性文本，由玩家确认。':'原表存在选项和特性，但 E:H 无同名通用数值；保留空值，不借用其他种族数值。'};
        const old={通用特性:m.get(`E${n}`)??null,生物种类:m.get(`F${n}`)??null,体型:m.get(`G${n}`)??null,速度:m.get(`H${n}`)??null};
        result.push({source,ruleset,name,sheet:'种族',range:`A${n}:H${n}`,payload,old});
      }
    }
  }
  return result;
}
export function repairSpecies(db) {
  const report={added5e:0,added5r:0,corrected5r:0,preservedCustom:0,missingStats:[]};
  if(!speciesRepairPending(db))return {...report,alreadyApplied:true};
  const candidates=speciesCandidates(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const row of candidates) {
      const id=`${row.source}:${row.sheet}:${row.range}:species`;
      const existing=db.prepare('SELECT name,payload_json FROM library_entries WHERE id=?').get(id);
      if(row.ruleset==='dnd5e-2014' && db.prepare("SELECT 1 FROM library_entries WHERE source_id=? AND kind='species' AND name=?").get(row.source,row.name))continue;
      if(!existing) {
        db.prepare("INSERT INTO library_entries(id,source_id,ruleset,kind,name,source_sheet,source_range,payload_json) VALUES(?,?,?,'species',?,?,?,?)").run(id,row.source,row.ruleset,row.name,row.sheet,row.range,JSON.stringify(row.payload));
        report[row.ruleset==='dnd5e-2014'?'added5e':'added5r']++;
      } else if(row.old) {
        const p=JSON.parse(existing.payload_json);
        if(existing.name!==row.name || !Object.entries(row.old).every(([k,v])=>JSON.stringify(p[k]??null)===JSON.stringify(v))) {report.preservedCustom++;continue;}
        db.prepare('UPDATE library_entries SET payload_json=? WHERE id=?').run(JSON.stringify({...p,...row.payload}),id);
        report.corrected5r++;
      }
      if(row.old&&!row.payload.速度)report.missingStats.push(row.name);
    }
    db.exec('CREATE TABLE IF NOT EXISTS library_repairs(id TEXT PRIMARY KEY, report_json TEXT NOT NULL)');
    db.prepare('INSERT INTO library_repairs VALUES(?,?)').run(SPECIES_REPAIR,JSON.stringify(report));
    db.exec('COMMIT');return report;
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
