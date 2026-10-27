// Run with Electron. The temporary profile never touches the user's characters.
import { app, BrowserWindow, protocol } from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppHandler, APP_ORIGIN } from '../desktop/protocol.mjs';
import { bootstrapLibrary, validateLibrary } from '../desktop/library-bootstrap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const creationProbe = process.argv.includes('--creation');
const output = path.join(root, '.codex-tmp', creationProbe ? 'creation' : 'summary-layout');
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'inkdice-summary-'));
app.setPath('userData', profile);
protocol.registerSchemesAsPrivileged([{ scheme: 'inkdice', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let database;
const report = { profile, checks: [], errors: [] };
const watchdog = setTimeout(() => { report.errors.push('timeout'); finish(); }, 60000);
function finish() {
  clearTimeout(watchdog);
  report.ok = report.checks.length >= (creationProbe ? 2 : 6) && report.checks.every(check => check.ok) && !report.errors.length;
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  database?.close();
  app.exit(report.ok ? 0 : 1);
}
app.whenReady().then(async () => {
try {
  const databasePath = path.join(profile, 'library.sqlite');
  bootstrapLibrary(path.join(root, 'local-data/content-library.sqlite'), databasePath);
  database = validateLibrary(databasePath);
  protocol.handle('inkdice', createAppHandler(root, () => database));
  const win = new BrowserWindow({ width: 1440, height: 960, show: false, webPreferences: { preload: path.join(root, 'desktop/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  await win.loadURL(`${APP_ORIGIN}/prototype/`);
  await delay(1200);
  const js = script => win.webContents.executeJavaScript(script);
  if (creationProbe) {
    await js(`document.getElementById('newCharacter').click(); document.getElementById('createNext').click()`);
    await delay(400);
    report.wizard = await js(`({html:document.getElementById('createSystemOptions').outerHTML,rect:document.getElementById('createCharacterDialog').getBoundingClientRect().toJSON()})`);
    writeFileSync(path.join(output, 'wizard.png'), (await win.webContents.capturePage()).toPNG());
    for (const ruleset of ['dnd5e-2014', 'dnd5r-2024']) {
      const point = await js(`(()=>{const r=document.querySelector('input[value="${ruleset}"][name="createRuleset"]').closest('label').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
      await delay(150);
      report.checks.push(await js(`({name:'select-${ruleset}',ok:document.querySelector('input[name="createRuleset"]:checked')?.value==='${ruleset}',selected:document.querySelector('input[name="createRuleset"]:checked')?.value})`));
      await js(`document.getElementById('createConfirm').click()`);
      await delay(350);
      report.checks.push(await js(`({name:'create-${ruleset}',ok:!document.getElementById('createCharacterDialog').open&&document.getElementById('rulesetDisplay').value.includes('${ruleset==='dnd5e-2014'?'2014':'2024'}')})`));
      await delay(800);
      await js(`(()=>{const input=document.getElementById('species');input.value='';input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await js(`(async()=>{const end=Date.now()+5000;while(!document.querySelector('[data-suggestion-more]')){if(Date.now()>end)throw Error('种族第一页等待超时');await new Promise(r=>setTimeout(r,50));}})()`);
      for (let page = 0; page < 8; page++) {
        if (!await js(`Boolean(document.querySelector('[data-suggestion-more]'))`)) break;
        await js(`document.querySelector('[data-suggestion-more]').click()`);
        await js(`(async()=>{const end=Date.now()+5000;while(document.querySelector('[data-suggestion-more]')?.disabled){if(Date.now()>end)throw Error('种族分页等待超时');await new Promise(r=>setTimeout(r,50));}})()`);
      }
      report.checks.push(await js(`(()=>{const count=document.querySelectorAll('[data-suggestion-index]').length;return {name:'browse-all-${ruleset}',count,ok:count===${ruleset==='dnd5e-2014'?106:163}&&!document.querySelector('[data-suggestion-more]')}})()`));
      await js(`(()=>{const species=document.getElementById('species');species.value='精灵';species.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await delay(400);
      report.checks.push(await js(`({name:'find-elf-${ruleset}',ok:[...document.querySelectorAll('.suggestion-option strong')].some(el=>el.textContent==='精灵')})`));
      if (ruleset === 'dnd5e-2014') await js(`document.getElementById('newCharacter').click();document.getElementById('createNext').click()`);
    }
    report.species = await js(`Promise.all(['dnd5e-2014','dnd5r-2024'].map(async ruleset=>{const data=await (await fetch('/api/library/search?'+new URLSearchParams({ruleset,kind:'species',limit:'50'}))).json();return {ruleset,total:data.total,names:data.results.map(r=>r.name)}}))`);
    finish(); return;
  }
  report.startup = await js(`({title:document.title,text:document.body.innerText.slice(0,2500)})`);
  await js(`document.querySelector('[data-character-page="summary"]').click()`);
  for (const width of [1040, 1440, 1920]) {
    win.setContentSize(width, 960);
    await delay(700);
    report.checks.push(await js(`(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect();
      const combat=box('.summary-combat'),career=box('.summary-career'),portrait=box('#summaryPortraitDock'),overview=box('.summary-overview');
      const inputs=[...document.querySelectorAll('.summary-overview-fields input:not([hidden]),.summary-overview-fields select')].filter(el=>el.getBoundingClientRect().width>0);
      const contained=inputs.every(el=>{const r=el.getBoundingClientRect();return r.left>=overview.left-1 && r.right<=portrait.left+1;});
      return {name:'layout-${width}',ok:combat.top<career.top&&combat.top===portrait.top&&portrait.width>=225&&portrait.right<=document.documentElement.clientWidth&&contained,combatY:combat.top,careerY:career.top,portraitWidth:portrait.width,contained};
    })()`));
    writeFileSync(path.join(output, `${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  report.checks.push(await js(`(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
    return {name:'unique-ids',ok:new Set(ids).size===ids.length};
  })()`));
  report.checks.push(await js(`(()=>{
    const portrait=document.querySelector('.portrait-card');
    const hp=document.getElementById('currentHp');hp.value='7';hp.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('[data-character-page="character"]').click();
    const character=document.querySelector('.profile-pane .portrait-card')===portrait;
    document.querySelector('[data-character-page="summary"]').click();
    return {name:'shared-portrait-and-hp',ok:character&&document.querySelector('#summaryPortraitDock .portrait-card')===portrait&&document.getElementById('currentHp').value==='7'};
  })()`));
  await js(`document.getElementById('sidebarToggle').click();document.getElementById('addMulticlass').click()`);
  win.setContentSize(1040, 960);
  await delay(700);
  report.checks.push(await js(`(()=>{
    const row=document.querySelector('.multiclass-row'), portrait=document.getElementById('summaryPortraitDock').getBoundingClientRect();
    const r=row.getBoundingClientRect();return {name:'collapsed-multiclass',ok:r.right<=portrait.left&&portrait.right<=innerWidth};
  })()`));
  writeFileSync(path.join(output, 'multiclass.png'), (await win.webContents.capturePage()).toPNG());
} catch (error) { report.errors.push(error.stack); }
finish();
});
