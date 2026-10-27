// Read-only coverage report; nonempty output is not a claim of complete rule automation.
import {writeFileSync} from 'node:fs';
import {openLibrary,classOptions} from './library.mjs';
import {resolveAdditionalFeatures} from './feature-import.mjs';
const db=openLibrary(process.argv[2]||'local-data/content-library.sqlite');
try {
 const report={repairedReferences:db.prepare('SELECT COUNT(*) AS n FROM library_content_repairs').get().n,subclasses:[],species:{}};
 for(const c of classOptions(db,{ruleset:'dnd5e-2014'}).results) for(const s of c.payload.规则关联.subclasses) {
  const r=resolveAdditionalFeatures(db,{ruleset:'dnd5e-2014',classId:c.classId,level:20,subclass:s.name},'class');
  report.subclasses.push({class:c.name,name:s.name,features:r.entries.map(e=>({name:e.name,level:e.payload.规则关联.minLevel,length:e.payload.描述.length,source:e.sourceSheet})),warnings:r.warnings});
 }
 for(const ruleset of ['dnd5e-2014','dnd5r-2024']) report.species[ruleset]=db.prepare("SELECT name FROM library_entries WHERE ruleset=? AND kind='species'").all(ruleset).map(({name})=>{
  const r=resolveAdditionalFeatures(db,{ruleset,species:name},'species');
  return {name,features:r.entries.map(e=>e.name),warnings:r.warnings,sourceChoices:r.sourceChoices};
 });
 const output=process.argv[3]||'.codex-tmp/feature-import-audit.json';
 writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({output,repairedReferences:report.repairedReferences,subclassesWithText:report.subclasses.filter(s=>s.features.length).length,subclassesTotal:report.subclasses.length,
   subclassWarnings:report.subclasses.filter(s=>s.warnings.length).map(s=>({name:s.name,warnings:s.warnings})),species:Object.fromEntries(Object.entries(report.species).map(([r,rows])=>[r,{total:rows.length,withoutWarnings:rows.filter(s=>s.features.length&&!s.warnings.length).length,requiresSourceChoice:rows.filter(s=>s.sourceChoices?.length).length}]))},null,2));
}finally{db.close()}
