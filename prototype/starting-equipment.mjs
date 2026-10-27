const hash=text=>{let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(16);};
const amount=s=>({'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'十':10})[s]||Number(s);
export function startingEquipmentBlueprint(c,entry) {
  if(!entry||entry.ruleset!==c.ruleset||entry.classId!==c.classId) return null;
  const info=entry.payload?.初始熟练与装备;
  const text=typeof info==='string'?info:String(info?.起始装备||'');
  const fixed=[],groups=[];
  const splitOptions=line=>{
    const parts=[...line.matchAll(/[（(]([a-cA-C])[）)]\s*([\s\S]*?)(?=[（(][a-cA-C][）)]|$)/g)];
    return parts.map(m=>({id:m[1].toUpperCase(),text:m[2].replace(/[\s，,；;]*(?:或者?|，)?\s*$/,'').trim()}));
  };
  if(c.ruleset==='dnd5r-2024'&&/选择A/.test(text)) groups.push(splitOptions(text));
  else if(c.ruleset==='dnd5e-2014'&&text.includes('•')) {
    for(const line of text.split('•').slice(1)) {
      const options=splitOptions(line);if(options.length) groups.push(options);else fixed.push(line.trim());
    }
  } else return {text,key:'',groups:[],fixed:[],review:'此来源尚未适配为装备方案；请按原文选择，不自动发放。'};
  if(groups.some(g=>g.length<2)) return {text,key:'',groups:[],fixed:[],review:'未完整识别互斥方案，保留原文供核对。'};
  return {text,groups,fixed,key:`${c.ruleset}:${c.classId}:${hash(text)}`,review:''};
}
function tokens(text) {
  // A quiver is not a quantity of arrows. Keep both objects, without double counting.
  text=text.replace(/一个箭袋（内含\s*20\s*支箭）/g,'箭袋，20支箭').replace(/一袋\s*20\s*支箭/g,'箭袋，20支箭').replace(/以及/g,'，');
  const parts=[];let depth=0,part='';
  for(const char of text) {
    if('（('.includes(char)) depth++;
    if('）)'.includes(char)) depth--;
    if(!depth&&'，,、和与\n'.includes(char)) {if(part.trim())parts.push(part.trim());part='';}else part+=char;
  }
  if(part.trim())parts.push(part.trim());
  return parts.map(t=>t.replace(/^以及|^及|[；;。.]$/g,'').trim()).filter(Boolean);
}
export function startingEquipmentPlan(c,entry) {
  const blueprint=startingEquipmentBlueprint(c,entry);
  if(!blueprint) return null;
  const choice=c.startingEquipmentChoices?.[blueprint.key]||{},errors=[],items=[],pending=[];let gp=0;
  if(blueprint.review) errors.push(blueprint.review);
  const lines=[...blueprint.fixed];
  blueprint.groups.forEach((g,i)=>{
    const option=g.find(o=>o.id===choice.branches?.[i]);
    if(option)lines.push(option.text);else errors.push(`请选择第${i+1}组装备方案`);
  });
  for(const [index,raw] of lines.flatMap(tokens).entries()) {
    let name=raw.replace(/^任意|^任一/g,'').trim(),quantity=1;
    const money=name.match(/^(\d+)\s*GP$/i);if(money){gp+=Number(money[1]);continue;}
    const q=name.match(/^([一二两三四五六十]|\d+)\s*(?:把|支|根|杆|件|面|个|本|套|发)\s*(.+)$/);
    if(q){quantity=amount(q[1]);name=q[2];}
    const conditional=/拥有熟练项时可选/.test(name);name=name.replace(/（拥有熟练项时可选）/,'');
    if(/任意|任一|其它|你.*选择|简易.*武器|军用.*武器|工匠工具或乐器/.test(name)||name==='乐器') {
      for(let n=0;n<quantity;n++) {
        const id=`${index}:${n}:${hash(raw)}`,value=String(choice.replacements?.[id]||'').trim();
        pending.push({id,label:raw,selected:value});
        if(!value||/任意|任选|选择|武器$|乐器$/.test(value)) errors.push(`请具体填写：${raw}${quantity>1?'（第'+(n+1)+'件）':''}`);
        else items.push({name:value,quantity:1});
      }
    } else if(name) items.push({name,quantity});
    if(conditional&&!choice.confirmRestrictions) errors.push(`${name}需要熟练，请核对后确认条件`);
  }
  return {...blueprint,choice,items,gp,pending,errors:[...new Set(errors)]};
}
export function normalizeStartingChoices(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0,40).filter(([k])=>/^dnd5[er]-\d{4}:/.test(k)&&k.length<100).map(([k,v])=>[k,{
    branches:Array.isArray(v?.branches)?v.branches.slice(0,10).map(x=>['A','B','C'].includes(x)?x:''):[],
    replacements:Object.fromEntries(Object.entries(v?.replacements&&typeof v.replacements==='object'?v.replacements:{}).slice(0,40).filter(([key])=>/^\d+:\d+:[a-f0-9]+$/.test(key)).map(([key,x])=>[key,String(x||'').slice(0,120)])),
    confirmRestrictions:v?.confirmRestrictions===true
  }]));
}
export function applyStartingEquipment(c,entry,{confirmed=false,itemDetails=[]}={}) {
  if(!confirmed) throw new Error('请确认尚未领取初始职业装备，并核对所选条件。');
  if(c.startingEquipmentReceipt) throw new Error('此卡已经领取过初始职业装备；先撤销原领取，不能跨职业或版本重复领取。');
  const plan=startingEquipmentPlan(c,entry);
  if(!plan||plan.errors.length) throw new Error(plan?.errors.join('；')||'当前职业来源不匹配。');
  const rows=plan.items.map((item,i)=>{
    const data=itemDetails[i]||{},known=Number.isFinite(data.weight)&&data.weight>=0;
    return {id:crypto.randomUUID(),name:item.name,quantity:item.quantity,weight:known?data.weight:0,section:'quick',description:`初始装备 · ${entry.name} · ${c.ruleset}。${known?'':'重量待核对（暂不计入负重）。'}${data.description||''}`.slice(0,1000)};
  });
  const before=Number(c.currency.gp)||0,after=before+plan.gp;
  if(after>999999999) throw new Error('金币总额超出人物卡上限。');
  c.inventory.push(...rows);c.currency.gp=after;
  c.startingEquipmentReceipt={key:plan.key,name:entry.name,ruleset:c.ruleset,items:JSON.parse(JSON.stringify(rows)),gpBefore:before,gpAfter:after};
  return `已加入背包 ${rows.length} 行物品与 ${plan.gp} GP；不会自动着装或覆盖现有装备。`;
}
export function undoStartingEquipment(c) {
  const receipt=c.startingEquipmentReceipt;if(!receipt) throw new Error('没有可撤销的初始装备领取。');
  const same=(a,b)=>a&&['id','name','quantity','weight','section','description'].every(k=>a[k]===b[k]);
  if(c.currency.gp!==receipt.gpAfter||receipt.items.some(item=>!same(c.inventory.find(x=>x.id===item.id),item))) throw new Error('领取的物品或金币已有变动，不能自动撤销；请在背包和钱币栏核对。');
  const ids=new Set(receipt.items.map(x=>x.id));c.inventory=c.inventory.filter(x=>!ids.has(x.id));c.currency.gp=receipt.gpBefore;c.startingEquipmentReceipt=null;
}
export function normalizeStartingReceipt(raw,normalizeItem) {
  if(!raw||typeof raw!=='object'||!/^dnd5[er]-\d{4}:/.test(raw.key||'')||!Array.isArray(raw.items)) return null;
  const before=Number(raw.gpBefore),after=Number(raw.gpAfter);
  if(!Number.isFinite(before)||!Number.isFinite(after)||before<0||after<before||after>999999999) return null;
  return {key:String(raw.key).slice(0,100),name:String(raw.name||'').slice(0,120),ruleset:String(raw.ruleset||'').slice(0,30),items:raw.items.slice(0,100).map(normalizeItem),gpBefore:before,gpAfter:after};
}
