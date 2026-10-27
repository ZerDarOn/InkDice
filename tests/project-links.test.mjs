import test from 'node:test';
import assert from 'node:assert/strict';
import {isProjectLink} from '../desktop/project-links.mjs';
import {APP_VERSION,PROJECT_URL,FEEDBACK_URL} from '../prototype/about.mjs';
import {readFileSync} from 'node:fs';
test('only fixed project links can open an external desktop browser',()=>{
  for(const url of [PROJECT_URL,FEEDBACK_URL,'https://github.com/ZerDarOn'])assert.equal(isProjectLink(url),true);
  for(const url of ['file:///C:/Windows','javascript:alert(1)',PROJECT_URL+'?private=secret',PROJECT_URL+'/../../other','https://github.com.evil.test/ZerDarOn/InkDice'])assert.equal(isProjectLink(url),false);
  assert.equal(APP_VERSION,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
});
