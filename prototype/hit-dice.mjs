import { CLASSES } from './content.mjs';
import { characterClasses } from './character-rules.mjs';

const integer = (n, max) => Math.max(0, Math.min(max, Math.trunc(Number(n) || 0)));
export function normalizeHitDiceSpent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([id]) => Object.hasOwn(CLASSES,id)).map(([id,n]) => [id,integer(n,20)]));
}

// Spend counts, not current counts, survive level gains. Legacy totals are never
// assigned to an arbitrary class when more than one distribution is possible.
export function hitDiceState(c) {
  const classes=characterClasses(c), maximum=classes.reduce((n,x)=>n+x.level,0);
  const invalid=maximum>20||new Set(classes.map(x=>x.classId)).size!==classes.length||classes.some(x=>!CLASSES[x.classId]||!Number.isInteger(x.level)||x.level<1);
  const stored=normalizeHitDiceSpent(c.hitDiceSpent), legacy=integer(c.hitDiceCurrent,maximum);
  const pending=invalid||(!stored&&classes.length>1&&legacy>0&&legacy<maximum);
  const pools=classes.map(x=>{
    const spent=stored?integer(stored[x.classId],x.level):pending?null:legacy===0?x.level:classes.length===1?x.level-legacy:0;
    return {...x,die:CLASSES[x.classId]?.hitDie,maximum:x.level,spent,current:spent===null?null:x.level-spent};
  });
  return {pools,maximum,pending,invalid,current:pending?legacy:pools.reduce((n,p)=>n+p.current,0)};
}

export function syncHitDice(c) {
  const state=hitDiceState(c);
  if(!state.pending) {
    // Keep inactive classes' expenditure for undoing an accidental class change.
    const existing=normalizeHitDiceSpent(c.hitDiceSpent)||{};
    c.hitDiceSpent={...existing,...Object.fromEntries(state.pools.map(p=>[p.classId,existing[p.classId]??p.spent]))};
    c.hitDiceCurrent=state.current;
  }
  return state;
}

export function setHitDiceAllocation(c,allocation) {
  const state=hitDiceState(c);
  if(state.invalid) throw new Error('请先修正重复职业或超过20级的职业等级。');
  const values=state.pools.map(p=>{
    const n=Number(allocation[p.classId]);
    if(allocation[p.classId]===''||!Number.isInteger(n)||n<0||n>p.maximum) throw new Error(`${CLASSES[p.classId].name}的当前生命骰必须为0–${p.maximum}的整数。`);
    return [p.classId,p.maximum-n];
  });
  const current=state.maximum-values.reduce((n,[,spent])=>n+spent,0);
  if(state.pending&&current!==state.current) throw new Error(`旧卡总数为 ${state.current}，分配合计必须一致；不会擅自补回生命骰。`);
  c.hitDiceSpent={...(normalizeHitDiceSpent(c.hitDiceSpent)||{}),...Object.fromEntries(values)};
  c.hitDiceCurrent=current;
  return '已保存分职业生命骰；未治疗或执行休息。';
}

export function hitDiceRecovery(c) {
  const state=hitDiceState(c), budget=c.ruleset==='dnd5r-2024'?state.maximum:Math.max(1,Math.floor(state.maximum/2));
  const count=Math.min(budget,state.maximum-state.current);
  return {...state,budget,count,needsChoice:!state.pending&&count>0&&count<state.maximum-state.current&&state.pools.filter(p=>p.spent>0).length>1};
}

// Validate the entire recovery before mutating HP, slots or any other resource.
export function planHitDiceRecovery(c,allocation) {
  const state=hitDiceRecovery(c);
  if(state.invalid) throw new Error('请先修正职业等级，再执行长休。');
  if(state.pending) {
    if(state.current+state.count===state.maximum) return Object.fromEntries(state.pools.map(p=>[p.classId,0]));
    throw new Error('请先把旧卡生命骰总数分配到各职业，再执行长休。');
  }
  if(!state.needsChoice) return Object.fromEntries(state.pools.map(p=>[p.classId,Math.max(0,p.spent-state.count)]));
  if(!allocation) throw new Error(`本次可恢复 ${state.count} 枚生命骰，请选择各职业恢复数量。`);
  const result={}, recovered=[];
  for(const p of state.pools) {
    const n=Number(allocation[p.classId]??0);
    if(!Number.isInteger(n)||n<0||n>p.spent) throw new Error(`${CLASSES[p.classId].name}最多恢复 ${p.spent} 枚生命骰。`);
    result[p.classId]=p.spent-n;recovered.push(n);
  }
  if(recovered.reduce((a,b)=>a+b,0)!==state.count) throw new Error(`恢复数量合计应为 ${state.count} 枚。`);
  return result;
}
