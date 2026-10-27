import test from 'node:test';
import assert from 'node:assert/strict';
import {rollDnd,rollCoc,cocOutcome,randomDie} from '../prototype/dice.mjs';
const sequence=values=>()=>values.shift();
test('D&D keeps each die and applies advantage before modifier',()=>{
  assert.deepEqual(rollDnd({count:2,sides:6,modifier:-2},sequence([3,6])).rolls,[3,6]);
  const a=rollDnd({mode:'advantage',modifier:5},sequence([1,20]));assert.equal(a.total,25);assert.deepEqual(a.rolls,[1,20]);
  assert.equal(rollDnd({mode:'disadvantage',modifier:-1},sequence([20,1])).total,0);
  for(const options of [{count:0},{sides:1},{modifier:''},{mode:'advantage',sides:6},{count:101},{mode:'bad'}])assert.throws(()=>rollDnd(options));
});
test('CoC 00 + 0 is 100 and bonus/penalty select complete values',()=>{
  const bonus=rollCoc({bonus:1,target:50},sequence([1,1,2]));assert.deepEqual(bonus.candidates,[100,10]);assert.equal(bonus.total,10);
  assert.equal(rollCoc({penalty:1},sequence([1,1,2])).total,100);
  const cancel=rollCoc({bonus:2,penalty:2},sequence([5,3]));assert.equal(cancel.total,24);assert.equal(cancel.tens.length,1);
  assert.throws(()=>rollCoc({target:''}));assert.throws(()=>rollCoc({bonus:3}));
});
test('CoC success boundaries and fumbles follow target value',()=>{
  for(const [n,target,outcome] of [[1,0,'大成功'],[96,49,'大失败'],[96,50,'失败'],[100,150,'大失败'],[10,50,'极难成功'],[11,50,'困难成功'],[25,50,'困难成功'],[26,50,'普通成功'],[50,50,'普通成功'],[51,50,'失败']])assert.equal(cocOutcome(n,target),outcome);
});
test('random dice discard biased tail rather than using modulo on it',()=>{
  const queue=[4294967295,0,5];const rng={getRandomValues:buffer=>{buffer[0]=queue.shift();}};
  assert.equal(randomDie(6,rng),1);assert.equal(randomDie(6,rng),6);
});
