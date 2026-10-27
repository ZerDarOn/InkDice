// Native NSIS policy checks ONLY: never packages/installs/uninstalls InkDice,
// writes registry keys, creates shortcuts or touches a real user profile.
// Set INKDICE_MAKENSIS when using a compiler outside electron-builder's cache.
import {existsSync,mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('..',import.meta.url));
const cache=path.join(process.env.LOCALAPPDATA||'','electron-builder','Cache');
function findCompiler(directory,depth=0) {
  if(depth>3||!existsSync(directory)) return;
  if(existsSync(path.join(directory,'Bin','makensis.exe'))) return path.join(directory,'Bin','makensis.exe');
  if(existsSync(path.join(directory,'makensis.exe'))) return path.join(directory,'makensis.exe');
  for(const item of readdirSync(directory,{withFileTypes:true})) if(item.isDirectory()) {
    const found=findCompiler(path.join(directory,item.name),depth+1);if(found)return found;
  }
}
const compiler=process.env.INKDICE_MAKENSIS || findCompiler(path.join(cache,'nsis-3.0.4.1'));
if(!compiler) throw Error('找不到 NSIS 编译器；请设置 INKDICE_MAKENSIS。未运行测试，不能视为通过。');
const directory=path.join(root,'.codex-tmp',`installer-policy-${Date.now()}`);
mkdirSync(directory,{recursive:true});
const cases=[
  ['0.1.5','0.1.4','older'],['0.1.5','0.1.5','equal'],['0.1.5','0.1.5.0','equal'],
  ['0.1.5','0.1.6','newer'],['0.1.5','0.1.10','newer'],['0.1.10','0.1.9','older'],
  ['0.1.10','0.1.10','equal'],['1.0.0','0.99.99','older'],['0.1.5','1.0.0','newer'],
  ['0.1.5','0.1.5.1','newer'],['0.1.5','','invalid'],['0.1.5','1.2','invalid'],
  ['0.1.5','0..5','invalid'],['0.1.5','0.1.5.','invalid'],['0.1.5','v0.1.5','invalid'],
  ['0.1.5','0.1.5-beta','invalid'],['0.1.5','0.1.5+build','invalid'],
  ['0.1.5','0.1.5.0.1','invalid'],['0.1.5','65536.0.0','invalid'],
  ['0.1.5','65535.0.0','newer'],['0.1.5','0.1.00005','invalid'],
  ['0.1.5','00.1.5','invalid'],['0.1.5','0.1.5 ','invalid']
];
const report={kind:'isolated-nsis-version-policy',applicationPackaged:false,compiler,checks:[]};
for(const target of new Set(cases.map(c=>c[0]))) {
  const exe=path.join(directory,`policy-${target}.exe`),source=path.join(directory,`policy-${target}.nsi`);
  // The production compare function is included unchanged. The unused install
  // macros are not expanded; the harness Section contains only assertions.
  writeFileSync(source,`Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${exe}"
!define VERSION "${target}"
!define UNINSTALL_REGISTRY_KEY "Software\\InkDice-ReadOnly-Test-${path.basename(directory)}"
!include "${path.join(root,'desktop','installer.nsh')}"
!include "FileFunc.nsh"
Function .onInit
  ; Compile and run the actual early gate against a unique, nonexistent key.
  ; Only reads occur, no registry fixtures are ever written.
  !insertmacro customInit
FunctionEnd
Section
  \${GetParameters} $0
  \${GetOptions} $0 "/installed=" $inkInstalledVersion
  \${GetOptions} $0 "/expect=" $1
  Call InkDiceCompareInstalledVersion
  StrCmp $inkVersionDecision $1 passed
  SetErrorLevel 1
  Quit
passed:
  SetErrorLevel 0
  Quit
SectionEnd
`,'utf8');
  const compile=spawnSync(compiler,['/V2','/INPUTCHARSET','UTF8',source],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(compile.status,0,`${compile.error||''}\n${compile.stdout}\n${compile.stderr}`);
  for(const [,installed,expected] of cases.filter(c=>c[0]===target)) {
    const result=spawnSync(exe,[`/installed=${installed}`,`/expect=${expected}`],{windowsHide:true,timeout:10000});
    const check={target,installed,expected,exitCode:result.status,ok:result.status===0,error:result.error?.message};
    report.checks.push(check);
  }
}
report.ok=report.checks.every(c=>c.ok);
writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,failed:report.checks.filter(c=>!c.ok),report:path.join(directory,'report.json')},null,2));
if(!report.ok)process.exitCode=1;
