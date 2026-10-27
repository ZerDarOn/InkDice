import {writeFileSync} from 'node:fs';
import {openLibrary} from './library.mjs';
import {resolveAdditionalFeatures} from './feature-import.mjs';
const db=openLibrary('local-data/content-library.sqlite');
const report=[];
for(const row of db.prepare("SELECT id,name,payload_json FROM library_entries WHERE ruleset='dnd5e-2014' AND kind='species'").all()) {
 const context={ruleset:'dnd5e-2014',species:row.name,speciesEntryId:row.id};
 const first=resolveAdditionalFeatures(db,context,'species');
 const contexts=first.sourceChoices?.length ? first.sourceChoices.flatMap(choice=>choice.options.map(o=>({...context,speciesReferences:{[choice.name]:o.id},choice:o.label}))) : [context];
 for(const c of contexts) {
  const result=resolveAdditionalFeatures(db,c,'species');
  report.push({name:row.name,family:JSON.parse(row.payload_json).族系,choice:c.choice||'',warnings:result.warnings,
   features:result.entries.map(e=>({name:e.name,description:e.payload.描述,source:e.sourceSheet}))});
 }
}
db.close();writeFileSync('.codex-tmp/species-mapping-audit.json',JSON.stringify(report,null,2));
for(const row of report) console.log(`${row.name} [${row.choice}] | ${row.features.map(e=>e.name).join('、')} | ${row.warnings.join(' ')}`);
