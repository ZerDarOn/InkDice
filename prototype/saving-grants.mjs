import { ABILITIES,CLASSES } from './content.mjs';
import { characterClasses } from './character-rules.mjs';

// Starting saves are not re-granted by multiclassing. Later class features are.
export function classSavingThrows(c) {
  const saves=new Set(CLASSES[c.classId]?.saves||[]),trace=[];
  for(const item of characterClasses(c)) {
    if(item.classId==='monk'&&item.level>=14) {
      Object.keys(ABILITIES).forEach(id=>saves.add(id));trace.push('武僧14级：所有豁免熟练（含死亡豁免）');
    }
    if(item.classId==='rogue'&&item.level>=15) {
      saves.add('wis');if(c.ruleset==='dnd5r-2024') saves.add('cha');
      trace.push(`游荡者15级：感知${c.ruleset==='dnd5r-2024'?'、魅力':''}豁免熟练`);
    }
  }
  return {saves:[...saves],trace,deathProficient:characterClasses(c).some(x=>x.classId==='monk'&&x.level>=14)};
}
