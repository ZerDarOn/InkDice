import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAppHandler, CSP } from '../desktop/protocol.mjs';
import { openLibrary } from '../tools/library.mjs';
import { testAiConnection } from '../tools/ai-test.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const db = openLibrary(fileURLToPath(new URL('../local-data/content-library.sqlite',import.meta.url)));
const handler = createAppHandler(root,()=>db);

test('desktop protocol serves packaged modules with CSP, without exposing user files',async()=>{
  for(const url of ['/prototype/','/prototype/app.js','/prototype/experience.mjs','/packages/rules-5e-2014/spell-slots.mjs']) {
    const response=await handler(new Request(`inkdice://app${url}`));
    assert.equal(response.status,200,url);assert.equal(response.headers.get('content-security-policy'),CSP);
  }
  for(const url of ['/local-data/content-library.sqlite','/desktop/main.mjs','/package.json','/prototype/%2e%2e%2flocal-data/content-library.sqlite','/prototype/%5c..%5clocal-data/content-library.sqlite']) {
    assert.ok((await handler(new Request(`inkdice://app${url}`))).status>=400,url);
  }
  assert.equal((await handler(new Request('inkdice://other/prototype/'))).status,403);
  assert.equal((await handler(new Request('inkdice://app/prototype/%ZZ'))).status,400);
});

test('desktop library API keeps both editions and class/spell filters',async()=>{
  for(const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const get=async route=>(await handler(new Request(`inkdice://app/api/library/${route}${route.includes('?')?'&':'?'}ruleset=${ruleset}`))).json();
    const summary=await get('summary');assert.equal(summary.ruleset,ruleset);assert.ok(summary.totalCells>10000);
    const classes=await get('classes');assert.equal(classes.results.length,13);
    const spells=await get('search?kind=spell&rank=3&query='+encodeURIComponent('火球'));assert.ok(spells.results.length>0);
    const detail=await get('entry?id='+encodeURIComponent(spells.results[0].id));assert.equal(detail.ruleset,ruleset);assert.equal(detail.rank,3);
  }
});

test('missing library and invalid requests return explicit failures',async()=>{
  const empty=createAppHandler(root,()=>null);
  assert.equal((await empty(new Request('inkdice://app/api/library/summary'))).status,503);
  assert.equal((await handler(new Request('inkdice://app/api/library/summary',{method:'POST'}))).status,405);
  assert.equal((await handler(new Request('inkdice://app/api/library/search?ruleset=unknown'))).status,400);
  assert.equal((await handler(new Request('inkdice://app/api/ai/test',{method:'POST',body:'{bad'}))).status,400);
});

test('shared AI connection test sends only the fixed probe and rejects failed formats',async()=>{
  let observed;
  const request=async(url,options)=>{observed={url:String(url),options};return Response.json({choices:[{message:{content:'OK'}}]});};
  const body={baseUrl:'https://provider.example/v1',model:'test-model',apiKey:'synthetic-test-key'};
  assert.equal((await testAiConnection(body,request)).ok,true);
  assert.equal(observed.url,'https://provider.example/v1/chat/completions');
  assert.deepEqual(JSON.parse(observed.options.body).messages,[{role:'user',content:'Reply with exactly: OK'}]);
  assert.equal((await testAiConnection({...body,baseUrl:'file:///private'},request)).ok,false);
  assert.equal((await testAiConnection(body,async()=>Response.json({bad:true}))).ok,false);
  assert.equal((await testAiConnection(body,async()=>Response.json({error:{message:'Denied'}},{status:401}))).status,422);
});

test.after(()=>db?.close());
