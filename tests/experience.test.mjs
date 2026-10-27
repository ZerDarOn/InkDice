import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCharacter, normalizeCharacter, exportDocument, importDocument } from '../prototype/model.mjs';
import { EXPERIENCE_THRESHOLDS, experienceProgress, experienceHint } from '../prototype/experience.mjs';

test('both editions use all twenty verified cumulative XP thresholds, including boundary values', () => {
  const expected = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];
  assert.deepEqual(EXPERIENCE_THRESHOLDS, expected);
  for (const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    for (const [index, xp] of expected.entries()) {
      const c = createCharacter({ ruleset, experience: xp });
      assert.equal(experienceProgress(c).xpLevel, index + 1);
      if (index) assert.equal(experienceProgress({...c, experience: xp - 1}).xpLevel, index);
    }
  }
});

test('XP guidance uses total multiclass level without modifying milestone levels or XP', () => {
  const c = createCharacter({ classId:'fighter', level:4, experience:6500, multiclasses:[{classId:'wizard',level:2}] });
  const before = structuredClone(c);
  const progress = experienceProgress(c);
  assert.equal(progress.level, 6);
  assert.equal(progress.xpLevel, 5);
  assert.equal(progress.minimum, 14000);
  assert.equal(progress.nextXp, 23000);
  assert.equal(progress.remaining, 16500);
  assert.match(experienceHint(progress), /总等级 6.*距 7 级还差 16,500/);
  assert.deepEqual(c, before);
});

test('surplus XP, twentieth level and invalid entries have honest non-destructive guidance', () => {
  const c = createCharacter({level:1,experience:355000});
  assert.equal(experienceProgress(c).remaining,0);
  assert.match(experienceHint(experienceProgress(c)),/经验已达 20 级/);
  assert.equal(experienceProgress({...c,level:20}).nextLevel,null);
  assert.match(experienceHint(experienceProgress({...c,level:20})),/已到 20 级/);
  for (const xp of [-1, 0.5, NaN, Infinity]) assert.equal(experienceProgress({...c,experience:xp}).xpLevel,null);
  for (const level of [0,21,1.5]) assert.equal(experienceProgress({...c,level}).level,null);
  assert.equal(experienceProgress({...c,ruleset:'coc-7e'}),null);
});

test('existing cards and import/export retain edition, spells and catalog provenance', () => {
  for (const ruleset of ['dnd5e-2014','dnd5r-2024']) {
    const c = normalizeCharacter(createCharacter({ruleset,experience:6500,spells:[{id:'preserved',name:'自定义法术',level:3,prepared:true,catalogEntry:{ruleset,name:'来源法术',payload:{说明:'原始说明'}}}],featureEntries:[{id:'feature',kind:'feat',name:'健壮'}]}));
    for (const restored of [normalizeCharacter(c),importDocument(exportDocument(c))]) {
      assert.equal(restored.ruleset,ruleset);
      assert.deepEqual(restored.spells,c.spells);
      assert.deepEqual(restored.featureEntries,c.featureEntries);
      assert.equal(restored.experience,6500);
    }
  }
});

test('only creation offers edition selection; character form displays read-only edition', () => {
  const html = readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
  const app = readFileSync(new URL('../prototype/app.js',import.meta.url),'utf8');
  assert.match(html, /id="rulesetDisplay"[^>]*readonly/);
  assert.doesNotMatch(html, /<(?:select|input)[^>]*name="ruleset"/);
  assert.match(app, /type="radio" name="createRuleset"/);
  assert.match(app, /if \(target.name === 'ruleset' \|\| target.id === 'rulesetDisplay'\) return;/);
});
