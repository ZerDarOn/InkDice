// Read-only audit: a recognized clause does NOT mean the whole feat is automated.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { featAbilitySpec } from '../prototype/advancement.mjs';
import { parseProficiencyGrant } from '../prototype/proficiency-grants.mjs';
const db=new DatabaseSync(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)),{readOnly:true});
try {
  const result=[];
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const rows=kind=>db.prepare('SELECT name,payload_json FROM library_entries WHERE ruleset=? AND kind=? ORDER BY name').all(ruleset,kind).map(r=>({...r,payload:JSON.parse(r.payload_json)}));
    const feats=rows('feat'),backgrounds=rows('background'),background={};
    for(const [kind,field] of [['tool','工具熟练'],['language','语言']]) {
      const present=backgrounds.filter(r=>r.payload[field]&&!['无','-','—'].includes(String(r.payload[field]).trim()));
      const pending=present.filter(r=>parseProficiencyGrant(r.payload[field],kind).review);
      background[kind]={nonempty:present.length,handled:present.length-pending.length,review:pending.length,pendingNames:pending.map(r=>r.name)};
    }
    result.push({ruleset,featCount:feats.length,recognizedAbilityClauses:feats.filter(r=>featAbilitySpec({kind:'feat',name:r.name,description:r.payload.描述})).length,background});
  }
  console.log(JSON.stringify({scope:'属性提升句及背景工具/语言的可解析覆盖，不代表全部规则完成',rulesets:result},null,2));
} finally { db.close(); }
