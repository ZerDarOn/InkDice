import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter,deriveMvpCharacter} from '../prototype/model.mjs';
import {resetCharacterLevel} from '../prototype/level-reset.mjs';
import {resourceDefinitions} from '../prototype/automation.mjs';
import {totalLevel} from '../prototype/character-rules.mjs';

for(const ruleset of ['dnd5e-2014','dnd5r-2024']) test(`reset ${ruleset} recalculates levels/resources without deleting player records`,()=>{
  const c=createCharacter({ruleset,classId:'wizard',level:8,subclass:'塑能学派',experience:50000,multiclasses:[{classId:'fighter',level:2}],species:'精灵',weapons:[{name:'保留武器'}],spells:[{name:'火球术',level:3,prepared:true}],featureEntries:[
    {id:'tough',kind:'feat',name:'健壮',level:4,effectMode:'manual',advancementSource:`${ruleset}:wizard:4`},
    {id:'higher',kind:'class',name:'高等级加成',level:8,effectMode:'manual',fillEffects:[{type:'bonus',target:'hp',value:100}]},
    {id:'species',kind:'species',name:'种族原文',description:'保留正文'},
  ]});
  c.tempHp=20;c.currentHp=99;c.concentrationSpellId=c.spells[0].id;
  c.resourceSpent={actionSurge:1};c.hitDiceSpent={wizard:4,fighter:1};
  const before=JSON.stringify(c);
  const reset=resetCharacterLevel(c,[{classId:'wizard',payload:{规则关联:{subclasses:[{name:'塑能学派',minLevel:ruleset==='dnd5e-2014'?2:3}]}}}]);
  assert.equal(JSON.stringify(c),before);
  assert.equal(totalLevel(reset),1);assert.equal(reset.classId,'wizard');assert.equal(reset.subclass,'');
  assert.equal(reset.experience,0);assert.equal(reset.multiclasses.length,0);
  assert.equal(reset.hitDiceCurrent,1);assert.deepEqual(reset.hitDiceSpent,{wizard:0});
  assert.equal(reset.tempHp,0);assert.equal(reset.concentrationSpellId,'');
  assert.equal(reset.spellSlots[1].maximum,2);assert.equal(reset.spellSlots[3].maximum,0);
  assert.equal(reset.currentHp,deriveMvpCharacter(createCharacter({ruleset,classId:'wizard',level:1})).hitPoints);
  assert.ok(!resourceDefinitions(reset).some(x=>x.id==='actionSurge'));
  assert.equal(reset.featureEntries.find(f=>f.id==='tough').effectMode,'off');
  assert.equal(reset.featureEntries.find(f=>f.id==='higher').effectMode,'off');
  assert.equal(reset.featureEntries.find(f=>f.id==='species').description,'保留正文');
  assert.equal(reset.weapons[0].name,'保留武器');assert.equal(reset.spells[0].name,'火球术');
});
test('reset retains a level-one or custom subclass, background feat and manual ability scores',()=>{
  for(const subclass of ['生命领域','自定义领域']) {
    const c=createCharacter({ruleset:'dnd5e-2014',classId:'cleric',level:5,subclass,abilities:{con:18},featureEntries:[{kind:'feat',name:'健壮',level:0}]});
    const reset=resetCharacterLevel(c,[{classId:'cleric',payload:{规则关联:{subclasses:[{name:'生命领域',minLevel:1}]}}}]);
    assert.equal(reset.subclass,subclass);assert.equal(reset.abilities.con,18);
    assert.equal(deriveMvpCharacter(reset).hitPoints,14);
  }
});
