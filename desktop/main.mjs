import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibrary, librarySummary } from '../tools/library.mjs';
import { APP_ORIGIN, createAppHandler } from './protocol.mjs';
import { bootstrapLibrary, validateLibrary } from './library-bootstrap.mjs';
import { isProjectLink } from './project-links.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const smokeOutput = process.argv.find(arg => arg.startsWith('--smoke-output='))?.slice('--smoke-output='.length);
const dataDirectory = smokeOutput ? path.join(path.dirname(path.resolve(smokeOutput)),'profile') : path.join(app.getPath('appData'),'InkDice');
mkdirSync(dataDirectory,{recursive:true});
app.setPath('userData',dataDirectory);
app.setName('墨骰工坊');
app.setAppUserModelId('com.inkdice.characterstudio');
protocol.registerSchemesAsPrivileged([{scheme:'inkdice',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);

let window;
let database;
let quitting = false;
let rendererReady = null;
let probeFinished = false;
let probeStarted = false;
let libraryBootstrap;
const libraryChecks = {};
const libraryPath = path.join(dataDirectory,'content-library.sqlite');
const requests = new Set();
const errors = [];

// Runs only in an isolated --smoke-output profile; never edits a real character.
async function probeLibraryUi() {
  if(probeStarted)return;
  probeStarted=true;
  try {
    libraryChecks.welcome=await window.webContents.executeJavaScript(`(async()=>{
      const {WELCOME_KEY}=await import('./about.mjs');
      const first=document.getElementById('aboutDialog').open;
      const text=document.getElementById('aboutDialog').textContent;
      const logo=document.querySelector('.brand-logo');
      document.getElementById('aboutStart').click();
      await new Promise(r=>setTimeout(r,50));
      const saved=localStorage.getItem(WELCOME_KEY)==='true';
      document.getElementById('aboutButton').click();
      return {first,saved,ok:saved&&document.getElementById('aboutDialog').open&&text.includes('ZerDarOn')&&!text.includes('开发组')&&logo.complete&&logo.naturalWidth>0};
    })()`);
    writeFileSync(path.join(path.dirname(path.resolve(smokeOutput)),'about.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("document.getElementById('aboutStart').click()");
    libraryChecks.coc=await window.webContents.executeJavaScript(`(async()=>{const {cocLibraryRequest}=await import('./coc/library.mjs');const r=await cocLibraryRequest('/api/library/search?ruleset=coc-7e&kind=occupation');return {total:r.total,ok:r.total>0};})()`);
    libraryChecks.ui=await window.webContents.executeJavaScript(`(async()=>{
      const el=id=>document.getElementById(id);
      const wait=async predicate=>{const end=Date.now()+9000;while(!predicate()){if(Date.now()>end)throw Error('资料筛选界面等待超时');await new Promise(r=>setTimeout(r,50));}};
      el('libraryButton').click();
      await wait(()=>el('librarySourceGroup').options.length>1&&el('libraryResults').querySelector('.library-result'));
      el('librarySourceGroup').value='core';el('librarySourceGroup').dispatchEvent(new Event('change'));
      await wait(()=>el('libraryResults').querySelector('.library-result'));
      el('libraryBook').value='玩家手册';el('libraryBook').dispatchEvent(new Event('change'));
      await wait(()=>el('libraryResults').querySelector('.library-result'));
      el('libraryKind').value='spell';el('libraryKind').dispatchEvent(new Event('change'));
      await wait(()=>el('libraryResults').querySelector('.library-result'));
      el('libraryResults').querySelector('.library-result').click();
      await wait(()=>el('libraryDetail').querySelector('dl'));
      const detail=el('libraryDetail').textContent;
      const boxes=['librarySourceGroup','libraryBook','libraryResetFilters'].map(id=>{const r=el(id).getBoundingClientRect();return {id,x:r.x,y:r.y,width:r.width,height:r.height};});
      return {ok:detail.includes('三宝书')&&detail.includes('玩家手册')&&boxes.every(b=>b.width>0&&b.x>=0&&b.x+b.width<=innerWidth),count:el('libraryResultCount').textContent,boxes};
    })()`);
    writeFileSync(path.join(path.dirname(path.resolve(smokeOutput)),'library.png'),(await window.webContents.capturePage()).toPNG());
    await probeExport();
    await probeSpeciesReplacement();
  } catch(error) {errors.push('library-ui:'+error.message);}
  finishProbe();
}

async function probeExport() {
  const directory=path.dirname(path.resolve(smokeOutput));
  await window.webContents.executeJavaScript(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.getElementById('exportButton').click()`);
  const download=async(button,extension)=>{
    const completed=new Promise((resolve,reject)=>{
      const onDownload=(_event,item)=>{
        clearTimeout(timer);const target=path.join(directory,`export.${extension}`);item.setSavePath(target);
        item.once('done',(_e,state)=>state==='completed'?resolve({name:item.getFilename(),bytes:statSync(target).size}):reject(Error(`download ${state}`)));
      };
      const timer=setTimeout(()=>{session.defaultSession.removeListener('will-download',onDownload);reject(Error('export download timeout'));},10000);
      session.defaultSession.once('will-download',onDownload);
    });
    await window.webContents.executeJavaScript(`document.getElementById('${button}').click()`);
    return completed;
  };
  const excel=await download('exportExcel','xlsx'),json=await download('exportJson','json');
  const portraits=await window.webContents.executeJavaScript(`(async()=>{
    const {createCharacter}=await import('./model.mjs'),{exportCharacterXlsx}=await import('./excel-export.mjs');
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#344E64';ctx.fillRect(0,0,100,200);
    const portrait=canvas.toDataURL('image/png'),card=createCharacter({name:'导出检查',player:'测试',portrait,deployedCreatures:[{name:'伙伴',portrait}]});
    const bytes=await exportCharacterXlsx(card),zip=await JSZip.loadAsync(bytes);
    return {bytes:Array.from(bytes),images:Object.keys(zip.files).filter(n=>/^xl\\/media\\/.+png$/.test(n)).length,sheets:Object.keys(zip.files).filter(n=>/^xl\\/worksheets\\/sheet\\d+\\.xml$/.test(n)).length};
  })()`);
  writeFileSync(path.join(directory,'portraits.xlsx'),Buffer.from(portraits.bytes));
  libraryChecks.export={excel,json,images:portraits.images,sheets:portraits.sheets,ok:excel.bytes>5000&&json.bytes>100&&excel.name.endsWith('-未填写玩家.xlsx')&&json.name.endsWith('-未填写玩家.json')&&portraits.images===2&&portraits.sheets===5};
}

// Verify the shipped renderer and bundled API together, in the smoke profile only.
async function probeSpeciesReplacement() {
  await window.loadURL(`${APP_ORIGIN}/prototype/styles.css`);
  await window.webContents.executeJavaScript(`(async()=>{
    const {createCharacter}=await import('/prototype/model.mjs');
    const {saveWorkspace}=await import('/prototype/store.mjs');
    const c=createCharacter({ruleset:'dnd5e-2014',name:'打包隔离检查',species:'兔人',classId:'wizard',level:6,subclass:'预言学派 School of Divination',featureEntries:[]});
    saveWorkspace({characters:[c],activeId:c.id,theme:'dark'});
  })()`);
  await window.loadURL(`${APP_ORIGIN}/prototype/`);
  libraryChecks.features=await window.webContents.executeJavaScript(`(async()=>{
    const wait=async predicate=>{const end=Date.now()+9000;while(!predicate()){if(Date.now()>end)throw Error('打包特性检查等待超时');await new Promise(r=>setTimeout(r,40));}};
    const names=()=>[...document.querySelectorAll('#speciesFeatureRows [data-feature-field="name"]')].map(e=>e.value);
    await wait(()=>document.getElementById('fillSpeciesFeatures'));
    document.querySelector('[data-character-page="summary"]').click();
    document.getElementById('fillSpeciesFeatures').click();
    await wait(()=>!document.getElementById('fillSpeciesFeatures').disabled&&names().includes('兔子跳'));
    const rabbit=names();
    const edited=document.querySelector('#speciesFeatureRows textarea');edited.value='打包测试手写';edited.dispatchEvent(new Event('change',{bubbles:true}));
    const change=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
    change('species','精灵');await wait(()=>names().includes('精类血统')&&!names().includes('兔子跳'));
    const elf=names();
    change('subrace','木精灵');await wait(()=>names().includes('野性面具'));
    const woodElf=names();
    change('species','兔人');await wait(()=>names().includes('兔子跳')&&!names().includes('野性面具'));
    const restored=[...document.querySelectorAll('#speciesFeatureRows textarea')].some(e=>e.value==='打包测试手写');
    document.getElementById('fillClassFeatures').click();
    await wait(()=>!document.getElementById('fillClassFeatures').disabled);
    const subclass=[...document.querySelectorAll('#classFeatureRows [data-feature-field="name"]')].map(e=>e.value);
    const revised=await (await fetch('/api/library/features?ruleset=dnd5r-2024&kind=species&context='+encodeURIComponent(JSON.stringify({species:'精灵',subrace:'高等精灵'})))).json();
    return {rabbit,elf,woodElf,restored,subclass,revisedCount:revised.results?.length,ok:rabbit.length===7&&elf.length===8&&woodElf.length===12&&restored&&subclass.includes('预兆')&&subclass.includes('预言专家')&&revised.results?.length===6};
  })()`);
}

async function importLibrary() {
  const choice = await dialog.showOpenDialog(window,{title:'载入已导入的本机资料库',properties:['openFile'],filters:[{name:'墨骰资料库',extensions:['sqlite']}]});
  if (choice.canceled || !choice.filePaths[0]) return;
  const selected = choice.filePaths[0];
  if (path.resolve(selected) === path.resolve(libraryPath)) return;
  try {
    validateLibrary(selected).close();
    if (existsSync(libraryPath)) {
      const answer = await dialog.showMessageBox(window,{type:'question',message:'替换当前资料库？',detail:'人物卡不会改变。原资料库将保存一份带时间的备份。',buttons:['取消','替换并备份'],defaultId:0,cancelId:0});
      if (answer.response !== 1) return;
    }
    const staged = path.join(dataDirectory,'content-library.pending.sqlite');
    copyFileSync(selected,staged);
    validateLibrary(staged).close();
    if (existsSync(libraryPath)) copyFileSync(libraryPath,`${libraryPath}.${Date.now()}.bak`);
    database?.close(); database = null;
    renameSync(staged,libraryPath);
    database = validateLibrary(libraryPath);
    window.reload();
  } catch (error) { if (!database && existsSync(libraryPath)) database = openLibrary(libraryPath); await dialog.showMessageBox(window,{type:'error',message:'资料库未载入',detail:String(error.message)}); }
}

function finishProbe(timedOut = false) {
  if (!smokeOutput || probeFinished) return;
  probeFinished = true;
  const summaries = {};
  if (database) for (const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const summary = librarySummary(database,{ruleset});
    summaries[ruleset] = {cells:summary.totalCells,entries:summary.kinds.reduce((sum,row)=>sum+row.count,0)};
  }
  const report = {packaged:app.isPackaged,version:app.getVersion(),runtime:process.versions,url:window?.webContents.getURL(),rendererReady,requests:[...requests],errors,timedOut,library:summaries,libraryBootstrap,libraryChecks};
  report.ok = !timedOut && Boolean(rendererReady?.characterCount) && errors.length === 0 && ['dnd5e-2014','dnd5r-2024','compendium','ui','export','features','welcome','coc'].every(id=>libraryChecks[id]?.ok) && requests.has('/api/library/classes:dnd5r-2024');
  writeFileSync(path.resolve(smokeOutput),JSON.stringify(report,null,2));
  app.exit(report.ok ? 0 : 1);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized()) window.restore();window.show();window.focus();}});
  app.whenReady().then(async () => {
    const bundledLibrary = app.isPackaged ? path.join(process.resourcesPath,'library/content-library.sqlite') : path.join(root,'local-data/content-library.sqlite');
    libraryBootstrap = bootstrapLibrary(bundledLibrary,libraryPath);
    database = validateLibrary(libraryPath);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const handler = createAppHandler(root,()=>database,(route,ruleset)=>requests.add(`${route}:${ruleset}`));
    protocol.handle('inkdice',handler);
    if(smokeOutput) for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
      const get = async route => (await handler(new Request(`${APP_ORIGIN}/api/library/${route}${route.includes('?')?'&':'?'}ruleset=${ruleset}`))).json();
      const classes = await get('classes');
      const spells = await get('search?kind=spell&rank=3&query='+encodeURIComponent('火球'));
      const detail = spells.results?.length ? await get('entry?id='+encodeURIComponent(spells.results[0].id)) : null;
      const species = await get('search?kind=species&query='+encodeURIComponent('精灵'));
      const books = await get('search?sourceGroup=core&book='+encodeURIComponent('玩家手册')+'&kind=spell');
      libraryChecks[ruleset] = {classes:classes.results?.length,spell:detail?.name,rank:detail?.rank,firstSpecies:species.results?.[0]?.name,coreSpells:books.total,ok:classes.results?.length===13 && detail?.ruleset===ruleset && detail?.rank===3 && species.results?.[0]?.name==='精灵' && books.total>0};
    }
    if(smokeOutput) {
      const get=async(ruleset,kind,query='')=>(await handler(new Request(`${APP_ORIGIN}/api/library/search?ruleset=${ruleset}&kind=${kind}&query=${encodeURIComponent(query)}`))).json();
      const refs=await get('dnd5e-2014','reference');
      const curios=await get('dnd5e-2014','curio','次元袋');
      const other=await get('dnd5r-2024','reference');
      libraryChecks.compendium={referencePages:refs.total,bagOfHolding:curios.total,otherEdition:other.total,ok:refs.total===4172&&curios.total===1&&other.total===0};
    }
    window = new BrowserWindow({width:1440,height:960,minWidth:1040,minHeight:700,show:!smokeOutput,title:`墨骰工坊 ${app.getVersion()}`,backgroundColor:'#101216',icon:path.join(root,'desktop/assets/icon.ico'),webPreferences:{preload:path.join(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
    window.webContents.setWindowOpenHandler(({url})=>{
      if(isProjectLink(url))shell.openExternal(url).catch(()=>dialog.showErrorBox('无法打开浏览器','请手动访问 https://github.com/ZerDarOn/InkDice'));
      return {action:'deny'};
    });
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(`${APP_ORIGIN}/prototype/`))event.preventDefault();});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.webContents.on('render-process-gone',(_event,details)=>{errors.push(`renderer:${details.reason}`);if(smokeOutput)finishProbe(true);});
    window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message.slice(0,500));});
    window.webContents.on('did-fail-load',(_event,code,description)=>{if(code!==-3){errors.push(description);if(smokeOutput)finishProbe(true);else dialog.showErrorBox('页面载入失败',description);}});
    ipcMain.on('desktop-ready',(event,data)=>{
      if(event.sender!==window.webContents || event.senderFrame?.url!==`${APP_ORIGIN}/prototype/`)return;
      rendererReady={title:String(data.title).slice(0,60),statCount:Number(data.statCount),characterCount:Number(data.characterCount)};
      if(smokeOutput)setTimeout(()=>probeLibraryUi(),1000);
    });
    window.on('close',event=>{
      if(quitting)return;
      event.preventDefault();quitting=true;
      session.defaultSession.flushStorageData();
      session.defaultSession.cookies.flushStore().finally(()=>app.quit());
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'文件',submenu:[{label:'载入本机资料库…',click:importLibrary},{label:'打开人物数据目录',click:()=>shell.openPath(dataDirectory)},{type:'separator'},{role:'quit',label:'退出'}]},
      {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
      {label:'查看',submenu:[{role:'reload',label:'刷新页面'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]},
      {label:'帮助',submenu:[{label:'关于墨骰工坊',click:()=>window.webContents.executeJavaScript("document.getElementById('aboutButton').click()")},{label:'反馈问题与建议',click:()=>shell.openExternal('https://github.com/ZerDarOn/InkDice/issues/new/choose')},{label:'数据迁移说明',click:()=>dialog.showMessageBox(window,{type:'info',message:`墨骰工坊 ${app.getVersion()} · ZerDarOn`,detail:'5E / 5R / CoC 人物卡与独立资料。\n浏览器旧人物：先导出 JSON，再在此导入。\n人物数据保存在：'+dataDirectory+'\n随包附带资料库；已有用户库按保护逻辑备份并合并更新。\nAI 人物对话需配置服务，密钥仅保留在当前会话。\n本版本未进行数字签名，无联网自动更新。'})}]}
    ]));
    if(smokeOutput)setTimeout(()=>finishProbe(true),45000).unref();
    await window.loadURL(`${APP_ORIGIN}/prototype/`);
  }).catch(error=>{errors.push(String(error.message));if(smokeOutput)finishProbe(true);else{dialog.showErrorBox('墨骰工坊无法启动',String(error.message));app.quit();}});
}
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>database?.close());
