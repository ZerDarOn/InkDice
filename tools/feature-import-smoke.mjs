// Isolated Electron profile. Exercises the real UI and offline protocol, not mocks.
import {app,BrowserWindow,protocol} from 'electron';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAppHandler,APP_ORIGIN} from '../desktop/protocol.mjs';
import {openLibrary} from './library.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.codex-tmp/feature-import-smoke');
mkdirSync(output,{recursive:true});
const profile=mkdtempSync(path.join(os.tmpdir(),'inkdice-features-'));
app.setPath('userData',profile);
protocol.registerSchemesAsPrivileged([{scheme:'inkdice',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const report={profile,checks:[],errors:[]};let db;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let finished=false;
function finish(){if(finished)return;finished=true;clearTimeout(watchdog);report.ok=report.checks.length>=8&&report.checks.every(x=>x.ok)&&!report.errors.length;writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));db?.close();app.exit(report.ok?0:1);}
const watchdog=setTimeout(()=>{report.errors.push('timeout');finish();},60000);
app.whenReady().then(async()=>{try{
 db=openLibrary(path.join(root,'local-data/content-library.sqlite'));
 protocol.handle('inkdice',createAppHandler(root,()=>db));
 const win=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{offscreen:true,preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',e=>{if(e.level==='error')report.errors.push(e.message)});
 const js=s=>win.webContents.executeJavaScript(s);
 await win.loadURL(APP_ORIGIN+'/prototype/');
 for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
  // Leave the running app before seeding so its beforeunload save cannot overwrite the fixture.
  await win.loadURL(APP_ORIGIN+'/prototype/styles.css');
  await js(`(async()=>{const {createCharacter}=await import('/prototype/model.mjs');const {saveWorkspace}=await import('/prototype/store.mjs');const c=createCharacter({ruleset:'${ruleset}',name:'隔离测试',species:'精灵',subrace:'高等精灵',classId:'wizard',level:6,subclass:'预言学派 School of Divination',featureEntries:[]});saveWorkspace({characters:[c],activeId:c.id,theme:'dark'});})()`);
  await win.loadURL(APP_ORIGIN+'/prototype/');await delay(600);
  await js(`document.querySelector('[data-character-page="summary"]').click();document.getElementById('fillSpeciesFeatures').click()`);
  await js(`(async()=>{const end=Date.now()+7000;while(document.getElementById('fillSpeciesFeatures').disabled){if(Date.now()>end)throw Error('import timeout');await new Promise(r=>setTimeout(r,30));}})()`);
  report.checks.push(await js(`(()=>{const rows=document.querySelectorAll('#speciesFeatureRows .feature-ledger-row');return {name:'species-${ruleset}',count:rows.length,status:document.getElementById('speciesImportStatus').textContent,ok:rows.length===${ruleset==='dnd5e-2014'?12:6}}})()`));
  await js(`(()=>{const text=document.querySelector('#speciesFeatureRows textarea');text.value='玩家手写保留';text.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('fillSpeciesFeatures').click();})()`);
  await js(`(async()=>{while(document.getElementById('fillSpeciesFeatures').disabled)await new Promise(r=>setTimeout(r,30));})()`);
  report.checks.push(await js(`({name:'idempotent-${ruleset}',ok:document.getElementById('speciesImportStatus').textContent.includes('补入 0 项')&&document.querySelector('#speciesFeatureRows textarea').value==='玩家手写保留'})`));
  if(ruleset==='dnd5e-2014') {
   await js(`document.getElementById('fillClassFeatures').click()`);
   await js(`(async()=>{while(document.getElementById('fillClassFeatures').disabled)await new Promise(r=>setTimeout(r,30));})()`);
   report.checks.push(await js(`(()=>{const names=[...document.querySelectorAll('#classFeatureRows [data-feature-field="name"]')].map(e=>e.value);return {name:'5e-subclass',names,ok:names.includes('预兆')&&names.includes('预言专家')&&!names.includes('天眼通')}})()`));
  }
  for(const width of [1040,1440]) {
   win.setContentSize(width,960);
   await js(`document.getElementById('speciesFeaturesHeading').scrollIntoView({block:'start'})`);await delay(200);
   report.checks.push(await js(`(()=>{const h=document.getElementById('speciesFeaturesHeading').getBoundingClientRect(),b=document.getElementById('fillSpeciesFeatures').getBoundingClientRect();return {name:'button-layout-${ruleset}-${width}',ok:b.width>=24&&b.height>=24&&b.right<=innerWidth&&b.left>=0&&(h.right<=b.left||h.bottom<=b.top)}})()`));
   writeFileSync(path.join(output,`${ruleset}-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  if(ruleset==='dnd5e-2014') {
   await js(`for(const [id,value] of [['species','歌利亚'],['subrace','']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('fillSpeciesFeatures').click()`);
   await js(`(async()=>{while(document.getElementById('fillSpeciesFeatures').disabled)await new Promise(r=>setTimeout(r,30));})()`);
   await js(`(()=>{const select=document.querySelector('[data-species-import-source="歌利亚"]');if(!select)throw Error('缺少来源选择');select.value=[...select.options].find(o=>o.textContent.startsWith('多元宇宙')).value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await js(`(async()=>{while(document.getElementById('fillSpeciesFeatures').disabled)await new Promise(r=>setTimeout(r,30));})()`);
   report.checks.push(await js(`({name:'source-choice-ui',ok:[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].some(el=>el.value==='小型巨人')})`));
   report.checks.push(await js(`(async()=>{const original=window.fetch;const before=document.querySelectorAll('#speciesFeatureRows .feature-ledger-row').length;window.fetch=async()=>{throw Error('隔离测试断线')};try{document.getElementById('fillSpeciesFeatures').click();while(document.getElementById('fillSpeciesFeatures').disabled)await new Promise(r=>setTimeout(r,30));return {name:'failed-request-preserves-card',ok:before===document.querySelectorAll('#speciesFeatureRows .feature-ledger-row').length&&document.getElementById('speciesImportStatus').textContent.includes('隔离测试断线')&&!document.getElementById('fillSpeciesFeatures').disabled}}finally{window.fetch=original}})()`));
  }
 }
 // A new character chooses the rabbit through the real combobox, without the import button.
 await win.loadURL(APP_ORIGIN+'/prototype/styles.css');
 await js(`(async()=>{const {createCharacter}=await import('/prototype/model.mjs');const {saveWorkspace}=await import('/prototype/store.mjs');const c=createCharacter({ruleset:'dnd5e-2014',name:'兔人自动补入测试',species:'',subrace:'',featureEntries:[]});saveWorkspace({characters:[c],activeId:c.id,theme:'dark'});})()`);
 await win.loadURL(APP_ORIGIN+'/prototype/');await delay(500);
 await js(`(()=>{const el=document.getElementById('species');el.scrollIntoView({block:'center'});el.focus();el.value='兔人';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await delay(400);
 await js(`(()=>{const el=document.getElementById('species');el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
 await delay(600);
 await js(`document.querySelector('[data-character-page="summary"]').click()`);
 report.checks.push(await js(`(()=>{const names=[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].map(e=>e.value);return {name:'rabbit-selection-auto-import',names,status:document.getElementById('speciesImportStatus').textContent,ok:names.length===7&&names.includes('兔子跳')&&names.includes('野兔敏锐')}})()`));
 await js(`(()=>{document.querySelector('[data-add-feature="species"]').click();const el=[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].at(-1);el.scrollIntoView({block:'center',behavior:'instant'});el.focus();el.value='兔子';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await delay(600);
 report.checks.push(await js(`({name:'rabbit-feature-dropdown',hidden:document.getElementById('suggestionPopover').hidden,caption:document.getElementById('suggestionPopover').textContent,input:[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].at(-1)?.outerHTML,ok:!document.getElementById('suggestionPopover').hidden&&[...document.querySelectorAll('.suggestion-option strong')].some(e=>e.textContent==='兔子跳')&&![...document.querySelectorAll('.suggestion-option strong')].some(e=>e.textContent==='黑暗视觉')})`));
 writeFileSync(path.join(output,'rabbit-dropdown.png'),(await win.webContents.capturePage()).toPNG());
 await js(`(()=>{const el=[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].at(-1);el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
 await delay(350);
 report.checks.push(await js(`({name:'rabbit-keyboard-choice-fills-text',ok:[...document.querySelectorAll('#speciesFeatureRows textarea')].at(-1).value.includes('熟练加值的五倍')&&[...document.querySelectorAll('#speciesFeatureRows textarea')].at(-1).value.includes('长休')})`));
 await win.webContents.reload();await delay(600);
 report.checks.push(await js(`({name:'rabbit-persists-reload',ok:[...document.querySelectorAll('#speciesFeatureRows textarea')].some(e=>e.value.includes('熟练加值的五倍'))})`));
 await js(`(()=>{const text=document.querySelector('#speciesFeatureRows textarea');text.value='切换后应恢复的兔人手改';text.dispatchEvent(new Event('change',{bubbles:true}));const el=document.getElementById('species');el.value='精灵';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await delay(500);
 report.checks.push(await js(`(()=>{const names=[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].map(e=>e.value);return {name:'rabbit-to-elf-replaces',names,ok:names.length===8&&!names.includes('兔子跳')&&names.includes('精类血统')&&!document.querySelector('.species-feature-history').hidden}})()`));
 await js(`document.querySelector('[data-character-page="character"]').click();(()=>{const el=document.getElementById('subrace');el.scrollIntoView({block:'center',behavior:'instant'});el.focus();el.value='高等';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(350);
 report.checks.push(await js(`({name:'subrace-dropdown-family',ok:!document.getElementById('suggestionPopover').hidden&&[...document.querySelectorAll('.suggestion-option strong')].some(e=>e.textContent==='高等精灵')&&[...document.querySelectorAll('.suggestion-option span')].every(e=>e.textContent.includes('精灵族系'))})`));
 await js(`(()=>{const el=document.getElementById('subrace');el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);await delay(400);
 report.checks.push(await js(`({name:'subrace-keyboard-keeps-base',ok:document.getElementById('species').value==='精灵'&&document.getElementById('subrace').value==='高等精灵'&&[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].some(e=>e.value==='戏法')})`));
 await js(`(()=>{const el=document.getElementById('subrace');el.value='木精灵';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(400);
 report.checks.push(await js(`(()=>{const names=[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].map(e=>e.value);return {name:'high-to-wood-replaces',names,ok:names.length===12&&!names.includes('戏法')&&names.includes('野性面具')}})()`));
 await js(`(()=>{const el=document.getElementById('species');el.value='兔人';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(400);
 report.checks.push(await js(`({name:'switch-back-restores-edits',ok:[...document.querySelectorAll('#speciesFeatureRows textarea')].some(e=>e.value==='切换后应恢复的兔人手改')&&!document.getElementById('subrace').value&&![...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].some(e=>e.value==='野性面具')})`));
 await win.webContents.reload();await delay(500);
 report.checks.push(await js(`({name:'species-history-reload',ok:[...document.querySelectorAll('#speciesFeatureRows textarea')].some(e=>e.value==='切换后应恢复的兔人手改')&&!document.querySelector('.species-feature-history').hidden})`));
 await js(`document.querySelector('[data-character-page="summary"]').click();document.getElementById('speciesFeaturesHeading').scrollIntoView({block:'start',behavior:'instant'})`);await delay(150);
 writeFileSync(path.join(output,'species-replacement.png'),(await win.webContents.capturePage()).toPNG());
}catch(e){report.errors.push(e.stack)}finish();});
