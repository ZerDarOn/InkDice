import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCharacter,deriveMvpCharacter,buildTrace,validateCharacter} from '../prototype/model.mjs';
import {assistantTasks,assistantAiStatus,assistantGeometry} from '../prototype/assistant-state.mjs';

test('assistant traces reconcile every shown number with the current calculator in both editions',()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) for(const classId of ['fighter','bard','monk','sorcerer','wizard','barbarian']) {
    const c=createCharacter({ruleset,classId,level:6,armorId:'unarmored',shield:true,abilities:{str:12,dex:16,con:14,int:18,wis:16,cha:18},
      featureEntries:[{id:'custom',kind:'special',name:'调整',fillEffects:[{type:'bonus',target:'hp',value:2,scale:'level'},{type:'bonus',target:'ac',value:2},{type:'bonus',target:'initiative',value:3},{type:'bonus',target:'spellDc',value:1}]}]});
    const d=deriveMvpCharacter(c);
    for(const key of ['armorClass','hitPoints','initiative','proficiencyBonus','passivePerception','spellSaveDc']) {
      const t=buildTrace(c,d,key);assert.ok(t.complete,`${ruleset} ${classId} ${key}`);
      if(t.result!=='—') assert.equal(t.terms.reduce((sum,row)=>sum+row.value,0),t.result);
    }
  }
});
test('multiclass HP, selected unarmored defense, Jack initiative and DC bonuses are not omitted',()=>{
  const c=createCharacter({ruleset:'dnd5e-2014',classId:'bard',level:3,multiclasses:[{classId:'fighter',level:2}],armorId:'unarmored'});
  let d=deriveMvpCharacter(c),t=buildTrace(c,d,'hitPoints');
  assert.ok(t.terms.some(row=>row.label.includes('战士')));assert.equal(t.result,d.hitPoints);
  assert.ok(buildTrace(c,d,'initiative').terms.some(row=>row.label.includes('万事通')));
  c.classId='barbarian';c.multiclasses=[];c.abilities.con=18;d=deriveMvpCharacter(c);
  assert.ok(buildTrace(c,d,'armorClass').terms.some(row=>row.label.includes('野蛮人无甲防御')));
});
test('no caster yields no invented DC; an unexplained delta is labelled instead of hidden',()=>{
  const c=createCharacter({classId:'fighter'}),d=deriveMvpCharacter(c);
  assert.equal(buildTrace(c,d,'spellSaveDc').result,'—');
  d.armorClass+=7;const trace=buildTrace(c,d,'armorClass');
  assert.equal(trace.complete,false);assert.match(trace.terms.at(-1).label,/尚未分项/);assert.equal(trace.terms.at(-1).value,7);
});
test('tasks are only sourced from actual diagnostics, deduplicate, and never grant anything',()=>{
  const c=createCharacter(),d=deriveMvpCharacter(c),before=JSON.stringify(c);
  assert.deepEqual(assistantTasks([],d),[]);
  const tasks=assistantTasks([{field:'name',message:'缺少名称',severity:'error'},{field:'name',message:'缺少名称',severity:'error'}],d);
  assert.equal(tasks.length,1);assert.deepEqual(tasks[0].messages,['缺少名称']);assert.equal(JSON.stringify(c),before);
  const real=assistantTasks(validateCharacter(c),d);assert.ok(real.every(t=>t.messages.length));
});
test('intentionally disabled custom effects are not reported as unexpected inactive effects',()=>{
  const c=createCharacter({featureEntries:[{kind:'special',name:'主动关闭',effectMode:'off'}]});
  assert.ok(!validateCharacter(c).some(issue=>issue.field==='effectSummary'&&issue.message.includes('主动关闭')));
});
test('AI status distinguishes unconfigured, saved configuration and actual online status',()=>{
  assert.match(assistantAiStatus(null,false),/未配置 AI/);
  const profile={model:'test-model',baseUrl:'https://example.invalid/v1',testedAt:'2026-10-20T00:00:00Z'};
  assert.match(assistantAiStatus(profile,false),/当前会话无密钥/);
  assert.match(assistantAiStatus(profile,true),/服务是否在线以实际回复为准/);
  assert.match(assistantAiStatus(profile,true),/当前卡摘要与同系统/);
});
test('panel stays inside the viewport at all orb corners and center',()=>{
  for(const [w,h] of [[1280,800],[624,578],[375,667]]) for(const [x,y] of [[12,12],[w-70,12],[w-70,h-70],[12,h-70],[w/2,h/2]]) {
    const p=assistantGeometry(x,y,w,h);assert.ok(p.left>=12&&p.top>=12);assert.ok(p.left+p.width<=w-12);assert.ok(p.top+p.height<=h-12);
  }
});
test('assistant no longer includes demonstration advice or an unverified SRD source label',()=>{
  const app=fs.readFileSync(new URL('../prototype/app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
  assert.ok(!app.includes('让交涉更稳定'));assert.ok(!app.includes('activeCharacter.skills.persuasion = 2'));
  assert.ok(!html.includes('一条可撤销建议'));assert.ok(!html.includes('id="traceSource">SRD'));
});
