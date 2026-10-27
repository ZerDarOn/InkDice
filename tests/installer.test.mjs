import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import beforePack,{assertInstallerVersion} from '../desktop/installer-policy.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const config=read('electron-builder.yml'), installer=read('desktop/installer.nsh');

test('installer accepts stable numeric releases and rejects ambiguous version ordering',()=>{
  for(const version of ['0.1.5','0.1.10','1.0.0','65535.65535.65535']) assert.doesNotThrow(()=>assertInstallerVersion(version));
  for(const version of ['1.0','1.0.0.1','01.1.5','1.0.0-beta.1','1.0.0+test','65536.1.0','v1.0.0','']) assert.throws(()=>assertInstallerVersion(version));
  assert.doesNotThrow(()=>beforePack({packager:{appInfo:{version:'0.1.5'}}}));
  assert.throws(()=>beforePack({packager:{appInfo:{version:'0.2.0-beta'}}}));
});

test('installation is additive to ZIP distribution and does not enable online updates',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(config,/appId: com\.inkdice\.characterstudio/);
  assert.match(config,/beforePack: desktop\/installer-policy\.mjs/);
  assert.match(config,/target:\s*\n\s*- nsis\s*\n\s*- zip/);
  assert.match(config,/include: desktop\/installer\.nsh/);
  assert.match(config,/artifactName: InkDice-Setup-/);
  assert.match(config,/from: local-data\/content-library\.sqlite/);
  assert.match(config,/deleteAppDataOnUninstall: false/);
  assert.match(config,/createStartMenuShortcut: true/);
  assert.match(pkg.scripts['desktop:package'],/--win nsis zip/);
  assert.match(pkg.scripts['desktop:package:zip'],/--win zip/);
  assert.doesNotMatch(read('desktop/main.mjs'),/autoUpdater|checkForUpdates|electron-updater/);
  assert.doesNotMatch(config,/^publish:/m);
});

test('downgrade gate executes at customInit and checks every registry view before repair',()=>{
  const init=installer.match(/!macro customInit\b([\s\S]*?)!macroend/)[1];
  for(const hive of ['HKCU','HKLM']) for(const view of ['32','64']) assert.ok(init.includes(`!insertmacro InkDiceCheckRegistration ${hive} ${view}`));
  assert.ok(init.indexOf('HKLM 32')<init.indexOf('MB_YESNO'));
  assert.match(init,/SetRegView 64/);
  assert.match(init,/IfSilent inkSameExit/);
  assert.match(init,/MB_DEFBUTTON2/);
  assert.match(installer,/SetErrorLevel 1638\s+Quit/);
  assert.match(installer,/SetErrorLevel 13\s+Quit/);
  assert.doesNotMatch(installer,/WriteReg|RMDir|ExecWait|--delete-app-data/);
  assert.match(installer,/CreateShortCut.*卸载墨骰工坊.*UNINSTALL_FILENAME/);
  assert.match(installer,/Delete "\$SMPROGRAMS\\\$\{MENU_FILENAME\}\\卸载墨骰工坊\.lnk"/);
});
