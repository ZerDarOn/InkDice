// Own-app integration probe. A disposable profile keeps real characters untouched.
import { app,BrowserWindow,protocol } from 'electron';
import { mkdtempSync,mkdirSync,writeFileSync,statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppHandler,APP_ORIGIN } from '../desktop/protocol.mjs';
import { bootstrapLibrary,validateLibrary } from '../desktop/library-bootstrap.mjs';
const browser=process.argv.includes('--browser');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,browser?'.codex-tmp/excel-browser-smoke':'.codex-tmp/excel-smoke');mkdirSync(out,{recursive:true});
app.setPath('userData',mkdtempSync(path.join(os.tmpdir(),'inkdice-excel-')));
protocol.registerSchemesAsPrivileged([{scheme:'inkdice',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const report={checks:[],errors:[]};let db;
const timeout=setTimeout(()=>{report.errors.push('timeout');finish();},60000);
function finish(){clearTimeout(timeout);report.ok=report.checks.length>=5&&report.checks.every(c=>c.ok)&&!report.errors.length;writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));db?.close();app.exit(report.ok?0:1);}
app.whenReady().then(async()=>{try{
  const dbpath=path.join(app.getPath('userData'),'library.sqlite');bootstrapLibrary(path.join(root,'local-data/content-library.sqlite'),dbpath);db=validateLibrary(dbpath);
  protocol.handle('inkdice',createAppHandler(root,()=>db));
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')report.errors.push(event.message);});
  await win.loadURL(`${browser?'http://127.0.0.1:4173':APP_ORIGIN}/prototype/`);
  const js=s=>win.webContents.executeJavaScript(s),pause=ms=>new Promise(r=>setTimeout(r,ms));await pause(600);
  const before=await js('JSON.stringify(localStorage)');
  await js("document.getElementById('exportButton').click()");
  await pause(350);
  report.checks.push({name:'export chooser opens',ok:await js("document.getElementById('exportDialog').open")});
  writeFileSync(path.join(out,'export-dialog.png'),(await win.webContents.capturePage()).toPNG());
  for(const theme of ['light','dark']){
    await js(`document.documentElement.dataset.theme='${theme}'`);await pause(200);
    writeFileSync(path.join(out,`export-${theme}.png`),(await win.webContents.capturePage()).toPNG());
  }
  async function download(id,extension){
    const result=new Promise((resolve,reject)=>win.webContents.session.once('will-download',(_event,item)=>{const dest=path.join(out,`download.${extension}`);item.setSavePath(dest);item.once('done',(_e,state)=>state==='completed'?resolve({path:dest,name:item.getFilename(),bytes:statSync(dest).size}):reject(Error(state)));}));
    await js(`document.getElementById('${id}').click()`);return result;
  }
  const excel=await download('exportExcel','xlsx');report.checks.push({name:'actual Excel download',ok:excel.bytes>5000,...excel});
  const json=await download('exportJson','json');report.checks.push({name:'JSON still downloads',ok:json.bytes>100,...json});
  report.checks.push({name:'character-player filenames',ok:excel.name==='烬羽-未填写玩家.xlsx'&&json.name==='烬羽-未填写玩家.json'});
  report.checks.push({name:'no character changes',ok:before===await js('JSON.stringify(localStorage)')});
  report.checks.push({name:'no stuck busy state',ok:await js("!document.getElementById('exportExcel').disabled")});
  await js("document.getElementById('closeExport').click()");report.checks.push({name:'close works',ok:await js("!document.getElementById('exportDialog').open")});
  const portraitBytes=await js(`(async()=>{const {createCharacter}=await import('./model.mjs');const {exportCharacterXlsx}=await import('./excel-export.mjs');const canvas=document.createElement('canvas');canvas.width=100;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#344E64';ctx.fillRect(0,0,100,200);const portrait=canvas.toDataURL('image/png');const c=createCharacter({name:'立绘导出测试',portrait,deployedCreatures:[{name:'伙伴',portrait}]});return Array.from(await exportCharacterXlsx(c));})()`);
  writeFileSync(path.join(out,'portraits.xlsx'),Buffer.from(portraitBytes));
  report.checks.push({name:'real browser image decode',ok:portraitBytes.length>5000});
  finish();
}catch(e){report.errors.push(e.stack||String(e));finish();}});
