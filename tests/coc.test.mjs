import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter,normalizeCharacter,exportDocument,importDocument,deriveMvpCharacter} from '../prototype/model.mjs';
import {createCoc,deriveCoc,skillValue,chooseOccupation,chooseWeapon,weaponChance,occupationPoints,normalizeCoc,syncSkillBase,skillCandidates,occupationChoices,matchingOccupation,rollCocAttributes} from '../prototype/coc/model.mjs';
import {COC_CATALOG as catalog} from '../prototype/coc/catalog.mjs';
import {cocLibraryRequest} from '../prototype/coc/library.mjs';
import {buildExcelLayout} from '../prototype/excel-layout.mjs';
import {exportCharacterXlsx} from '../prototype/excel-export.mjs';
test('CoC schema is isolated and roundtrips without DND defaults',()=>{const c=createCharacter({ruleset:'coc-7e',name:'测试',player:'玩家'});assert.equal(c.ruleset,'coc-7e');for(const k of ['classId','level','abilities','spellSlots','featureEntries','currencyGp'])assert.equal(k in c,false,k);assert.deepEqual(importDocument(exportDocument(c)),c);assert.throws(()=>deriveMvpCharacter(c),/独立/);});
test('CoC formulas, overrides and zero resources',()=>{const c=createCoc({attributes:{str:75,siz:70,con:55,dex:60,pow:55,int:50,edu:85},hp:0,mp:0,san:0});let d=deriveCoc(c);assert.equal(d.hpMax,12);assert.equal(d.hp,0);assert.equal(d.mpMax,11);assert.equal(d.san,0);assert.equal(d.db,'+1D4');assert.equal(d.build,1);assert.equal(d.mov,8);c.age=55;assert.equal(deriveCoc(c).mov,6);c.overrides.hpMax=0;assert.equal(deriveCoc(c).hpMax,0);c.overrides.hpMax=null;assert.equal(deriveCoc(c).hpMax,12);});
test('Occupation points and template switching preserve allocations',()=>{const c=createCoc(),first=c.skills[0];first.occupation=20;const occ=catalog.occupations.find(e=>e.number===6);chooseOccupation(c,occ);assert.equal(deriveCoc(c).occupationPoints,occupationPoints(occ.formula,c.attributes));assert.equal(first.occupation,20);chooseOccupation(c,catalog.occupations[0]);assert.equal(first.occupation,20);assert.equal(c.skills.find(s=>s.label==='会计').occupational,true);chooseOccupation(c,null);assert.equal(first.occupational,false);assert.equal(first.occupation,20);});
test('Every imported occupation formula supports safe calculation',()=>{for(const occ of catalog.occupations)assert.ok(Number.isFinite(occupationPoints(occ.formula,{str:45,con:50,siz:60,dex:65,app:70,int:75,pow:80,edu:85})),occ.name);assert.throws(()=>occupationPoints('=process.exit()',{}));});
test('Occupation fills a named specialty only when blank',()=>{const c=createCoc(),s=c.skills.find(s=>s.label==='技艺①'),actor=catalog.occupations.find(e=>e.name==='演员-戏剧演员');chooseOccupation(c,actor);assert.equal(s.specialty,'表演');assert.equal(s.occupational,true);s.specialty='玩家的舞台艺术';chooseOccupation(c,actor);assert.equal(s.specialty,'玩家的舞台艺术');});
test('Named specialty aliases fill and switching revokes only untouched automatic values',()=>{
 const c=createCoc(),occ=catalog.occupations.find(e=>e.marks['科学①']==='生物');chooseOccupation(c,occ);
 const s=c.skills.find(s=>s.label==='科学①');assert.equal(s.specialty,'生物学');assert.equal(s.occupational,true);s.occupation=12;
 const restored=normalizeCoc(c);chooseOccupation(restored,catalog.occupations[0]);assert.equal(restored.skills.find(s=>s.label==='科学①').specialty,'');assert.equal(restored.skills.find(s=>s.label==='科学①').occupation,12);
 s.specialty='自定义生物';syncSkillBase(s);chooseOccupation(c,catalog.occupations[0]);assert.equal(s.specialty,'自定义生物');
 const language=catalog.occupations.find(e=>e.marks['外语①']==='拉丁');chooseOccupation(c,language);assert.equal(c.skills.find(s=>s.label==='外语①').specialty,'拉丁语');
});
test('Skill dropdowns are grouped and typed names recalculate bases',()=>{
 const c=createCoc(),s=c.skills.find(s=>s.label==='科学①');assert.ok(skillCandidates(s).some(e=>e.name==='数学'));assert.ok(!skillCandidates(s).some(e=>e.name==='斗殴'));
 s.specialty='数学';syncSkillBase(s);assert.equal(skillValue(c,s).base,10);s.specialty='化学';syncSkillBase(s);assert.equal(skillValue(c,s).base,1);
 s.baseOverride=7;s.specialty='数学';syncSkillBase(s);assert.equal(skillValue(c,s).base,7);
 const mother=c.skills.find(s=>s.label==='母语');mother.specialty='汉语';syncSkillBase(mother);c.attributes.edu=80;assert.equal(skillValue(c,mother).base,80);
 const dodge=c.skills.find(s=>s.label==='闪避');dodge.label='其他技能';syncSkillBase(dodge);assert.equal(dodge.baseRule,'');assert.equal(skillValue(c,dodge).base,0);
});
test('Optional groups expose source counts and reselecting occupation keeps player selections',()=>{
 const c=createCoc(),occ=catalog.occupations.find(e=>e.name==='演员-戏剧演员');chooseOccupation(c,occ);const social=occupationChoices(c).find(g=>g.key==='☯');assert.equal(social.count,2);assert.ok(social.candidates.includes('取悦'));
 c.skills.find(s=>s.label==='取悦').occupational=true;chooseOccupation(c,occ);assert.equal(occupationChoices(c).find(g=>g.key==='☯').selected,1);
});
test('Duplicate occupation names never silently select the first template',()=>{const candidates=catalog.occupations.filter(e=>e.name==='工匠');assert.equal(candidates.length,2);assert.equal(matchingOccupation('工匠',''),null);for(const entry of candidates){assert.equal(matchingOccupation('工匠',entry.id).number,entry.number);const c=createCoc({attributes:{edu:50,dex:40,str:80}});chooseOccupation(c,entry);assert.equal(deriveCoc(c).occupationPoints,entry.number===27?180:260);}});
test('Source skill difficulty columns and auxiliary reference data remain distinct',()=>{
 const e=catalog.skills.find(s=>s.name==='会计');assert.ok(e.fields.普通难度);assert.ok(e.fields.困难难度);assert.equal(e.fields.奖励情形,undefined);
 assert.ok(catalog.entries.some(e=>e.kind==='era'));assert.ok(catalog.entries.some(e=>e.kind==='experience'));assert.equal(new Set(catalog.entries.map(e=>e.id)).size,catalog.entries.length);
});
test('Derived breakpoints, attributes and manual resources are linked without resetting spent values',()=>{
 const c=createCoc({hp:3,mp:2,san:4});chooseOccupation(c,catalog.occupations.find(e=>e.formula==='=EDU*2+DEX*2'));
 c.attributes.edu=80;c.attributes.dex=65;c.attributes.int=60;c.attributes.con=70;c.attributes.siz=60;c.attributes.pow=75;
 const d=deriveCoc(c);assert.equal(d.occupationPoints,290);assert.equal(d.interestPoints,120);assert.equal(d.hpMax,13);assert.equal(d.mpMax,15);assert.deepEqual([d.hp,d.mp,d.san],[3,2,4]);
 for(const [sum,db,build] of [[64,'-2',-2],[65,'-1',-1],[84,'-1',-1],[85,'0',0],[124,'0',0],[125,'+1D4',1],[165,'+1D6',2],[205,'+2D6',3],[285,'+3D6',4]]){c.attributes.str=sum;c.attributes.siz=0;assert.equal(deriveCoc(c).db,db);assert.equal(deriveCoc(c).build,build);}
});
test('Excel includes growth flags, temporary HP and total point budgets',()=>{const c=createCoc({tempHp:8});c.skills[0].checked=true;const x=buildExcelLayout(c);assert.ok(x.sheets[1].cells.some(v=>v.value==='成长标'));assert.ok(x.sheets[1].cells.some(v=>v.value==='职业剩余 / 总点数'));assert.ok(x.sheets[2].cells.some(v=>v.value==='临时生命'));});
test('Age MOV brackets match the workbook including its 90+ extension',()=>{const c=createCoc();for(const [age,penalty] of [[19,0],[39,0],[40,1],[49,1],[50,2],[60,3],[70,4],[80,5],[90,6]]){c.age=age;assert.equal(deriveCoc(c).mov,8-penalty);}c.age=12;assert.match(deriveCoc(c).ageHint,/KP/);});
test('15–19 attribute roll uses the better of two luck rolls',()=>{let n=0;const young=rollCocAttributes(17,()=>++n<=24?1:6);assert.equal(young.luck,90);assert.equal(n,27);n=0;const adult=rollCocAttributes(25,()=>++n<=24?1:6);assert.equal(adult.luck,15);assert.equal(adult.edu,40);assert.equal(n,24);});
test('Skill base overrides and weapon association remain editable',()=>{const c=createCoc(),s=c.skills.find(s=>s.label==='闪避');assert.equal(skillValue(c,s).base,25);c.attributes.dex=80;assert.equal(skillValue(c,s).base,40);s.baseOverride=0;assert.equal(skillValue(c,s).base,0);const w={chance:''};chooseWeapon(w,catalog.weapons.find(w=>w.name==='黄铜指虎'));assert.equal(weaponChance(c,w),25);w.chance='0';assert.equal(weaponChance(c,w),0);});
test('Catalog complete structured ranges, source references and no private card',()=>{assert.equal(catalog.occupations.length,229);assert.equal(catalog.weapons.length,104);assert.equal(catalog.armors.length,74);assert.ok(catalog.entries.every(e=>e.sourceSheet&&e.sourceRange));const str=JSON.stringify(catalog);assert.ok(!str.includes('茶米一号'));assert.ok(!str.includes('Livy'));assert.ok(!str.includes('曾经人工克隆'));});
test('CoC library rejects wrong system and returns full bodies',()=>{assert.throws(()=>cocLibraryRequest('/api/library/search?ruleset=dnd5e-2014'));const r=cocLibraryRequest('/api/library/search?ruleset=coc-7e&query=会计&kind=occupation');assert.ok(r.results.length);const e=cocLibraryRequest('/api/library/entry?ruleset=coc-7e&id='+encodeURIComponent(r.results[0].id));assert.ok(e.payload.介绍.length>30);assert.equal(e.ruleset,'coc-7e');});
test('DND creation and normalization do not acquire CoC state',()=>{for(const ruleset of ['dnd5e-2014','dnd5r-2024']){const c=normalizeCharacter(createCharacter({ruleset}));assert.ok(!('attributes' in c));assert.ok(deriveMvpCharacter(c).hitPoints>0);}});
test('CoC five-sheet export contains independent names and editable text',async()=>{const c=createCoc({name:'测试',player:'玩家',story:'=1+2'}),layout=buildExcelLayout(c);assert.deepEqual(layout.sheets.map(s=>s.name),['调查员','技能','战斗','资产与物品','经历与神话']);const bytes=await exportCharacterXlsx(c);const z=await globalThis.JSZip.loadAsync(bytes);const xml=await z.file('xl/workbook.xml').async('string');assert.ok(xml.includes('name="调查员"'));assert.ok(!xml.includes('name="施法"'));const identity=await z.file('xl/worksheets/sheet1.xml').async('string');assert.ok(identity.includes('=1+2'));assert.ok(!identity.includes('<f>1+2</f>'));});
