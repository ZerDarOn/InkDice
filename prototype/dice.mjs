// Local, independent rolls. No character mutations and no network calls.
export function integer(value, min, max, label) {
  const n = Number(value);
  if (value === '' || !Number.isInteger(n) || n < min || n > max) throw Error(`${label}须为 ${min}–${max} 的整数`);
  return n;
}
export function randomDie(sides, random = globalThis.crypto) {
  integer(sides, 2, 1000, '骰面');
  const ceiling = Math.floor(0x100000000 / sides) * sides, sample = new Uint32Array(1);
  do { random.getRandomValues(sample); } while (sample[0] >= ceiling);
  return sample[0] % sides + 1;
}
export function rollDnd({count = 1, sides = 20, modifier = 0, mode = 'normal'}, die = randomDie) {
  count = integer(count, 1, 100, '骰数'); sides = integer(sides, 2, 1000, '骰面'); modifier = integer(modifier, -10000, 10000, '加值');
  if (!['normal','advantage','disadvantage'].includes(mode)) throw Error('未知掷骰方式');
  if (mode !== 'normal' && (count !== 1 || sides !== 20)) throw Error('优势／劣势仅用于单次 d20 检定');
  const rolls = Array.from({length:mode === 'normal' ? count : 2}, () => integer(die(sides), 1, sides, '骰点'));
  const kept = mode === 'advantage' ? Math.max(...rolls) : mode === 'disadvantage' ? Math.min(...rolls) : rolls.reduce((a,b)=>a+b,0);
  return {kind:'dnd',count,sides,modifier,mode,rolls,kept,total:kept+modifier};
}
export function cocOutcome(roll, target) {
  integer(roll,1,100,'百分骰'); integer(target,0,999,'目标值');
  if (roll === 1) return '大成功';
  if (roll === 100 || (target < 50 && roll >= 96)) return '大失败';
  if (roll <= Math.floor(target/5)) return '极难成功';
  if (roll <= Math.floor(target/2)) return '困难成功';
  return roll <= target ? '普通成功' : '失败';
}
export function rollCoc({target = 50, bonus = 0, penalty = 0}, die = randomDie) {
  target = integer(target,0,999,'目标值'); bonus = integer(bonus,0,2,'奖励骰'); penalty = integer(penalty,0,2,'惩罚骰');
  const net = bonus - penalty;
  const units = integer(die(10),1,10,'个位骰') - 1;
  const tens = Array.from({length:1+Math.abs(net)},()=>integer(die(10),1,10,'十位骰')-1);
  const candidates = tens.map(t=>t*10+units || 100);
  const total = net > 0 ? Math.min(...candidates) : Math.max(...candidates);
  return {kind:'coc',target,bonus,penalty,units,tens,candidates,total,outcome:cocOutcome(total,target)};
}
