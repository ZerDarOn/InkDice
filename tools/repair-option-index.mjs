import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { classIdForName } from '../prototype/character-rules.mjs';
const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)));
const counts={subclasses:0,excludedMisreads:0,styles:0};
db.exec('BEGIN');
try {
  db.prepare("UPDATE library_taxonomy SET label='专长' WHERE kind='feat'").run();
  db.prepare('INSERT OR REPLACE INTO library_taxonomy VALUES (?,?,?,?,?)').run('fighting_style','能力','战斗风格','partial','仅已实现的数值效果参与计算，条件性攻击效果请核对');
  for(const source of db.prepare('SELECT id,ruleset FROM library_sources').all()) {
    const entries=db.prepare('SELECT * FROM library_entries WHERE source_id=?').all(source.id);
    if(source.ruleset==='dnd5e-2014') {
      const cells=new Map(db.prepare("SELECT address,value_json FROM library_cells WHERE source_id=? AND sheet_name='图表'").all(source.id).map(c=>[c.address,JSON.parse(c.value_json || 'null')]));
      for(const column of ['CG','CH','CI','CJ','CK','CL','CM','CN','CO','CP','CQ','CR','CS']) {
        const name=cells.get(`${column}32`); const id=classIdForName(name);
        const entry=entries.find(e=>e.kind==='class'&&classIdForName(e.name)===id); if(!entry) continue;
        const p=JSON.parse(entry.payload_json); p.规则关联 ||= {}; p.规则关联.subclasses=[];
        for(let row=33;row<=100;row++) {
          const name=cells.get(`${column}${row}`); if(typeof name!=='string'||!name.trim()) break;
          p.规则关联.subclasses.push({name:name.trim(),minLevel:['cleric','sorcerer','warlock'].includes(id)?1:['wizard','druid'].includes(id)?2:3,source:`图表!${column}${row}`}); counts.subclasses++;
        }
        db.prepare('UPDATE library_entries SET payload_json=? WHERE id=?').run(JSON.stringify(p),entry.id);
      }
      const styles=new Map();
      for(const e of entries.filter(e=>e.kind==='class_feature')) {
        const p=JSON.parse(e.payload_json);
        if(Number(e.source_range.match(/\d+/)?.[0])>=31) {
          p.规则关联={...(p.规则关联||{}),isMisclassified:true,reason:'此区域为逐列子职业下拉表，不是职业能力名称与描述对'};
          db.prepare('UPDATE library_entries SET payload_json=? WHERE id=?').run(JSON.stringify(p),e.id); counts.excludedMisreads++;continue;
        }
        if(!e.name.includes('战斗风格')) continue;
        const text=p.描述; const headers=[...text.matchAll(/^\s*([\u4e00-\u9fff]{2,12})\s*([A-Z][A-Za-z ]+)\s*$/gm)];
        headers.forEach((m,index)=>{
          const name=m[1], desc=text.slice(m.index+m[0].length,headers[index+1]?.index??text.length).trim();
          if(!desc)return;
          const item=styles.get(name)||{name,desc,classes:[],ranges:[]}; item.classes.push(p.职业);item.ranges.push(e.source_range);styles.set(name,item);
        });
      }
      for(const item of styles.values()) {
        const p={分类:'战斗风格',描述:item.desc,规则关联:{allowedClasses:item.classes},来源范围:item.ranges};
        db.prepare('INSERT INTO library_entries (id,source_id,ruleset,kind,name,source_sheet,source_range,payload_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json').run(`${source.id}:fighting-style:${item.name}`,source.id,source.ruleset,'fighting_style',item.name,'图表',item.ranges.join(';'),JSON.stringify(p)); counts.styles++;
      }
    } else {
      for(const e of entries.filter(e=>e.kind==='feat')) if(JSON.parse(e.payload_json).分类==='战斗风格') {
        db.prepare("UPDATE library_entries SET kind='fighting_style' WHERE id=?").run(e.id);counts.styles++;
        db.prepare("UPDATE library_entry_classifications SET subcategory='战斗风格' WHERE entry_id=?").run(e.id);
      }
    }
  }
  db.exec('COMMIT'); console.log(JSON.stringify(counts));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
