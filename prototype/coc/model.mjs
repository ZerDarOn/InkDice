import { COC_CATALOG as catalog } from './catalog.mjs';
export const COC_RULESET='coc-7e';
export const isCoc=c=>c?.ruleset===COC_RULESET;
export const ATTRIBUTES={str:'力量 STR',con:'体质 CON',siz:'体型 SIZ',dex:'敏捷 DEX',app:'外貌 APP',int:'智力 INT',pow:'意志 POW',edu:'教育 EDU',luck:'幸运 Luck'};
export const COC_PAGES=[{id:'character',label:'调查员'},{id:'summary',label:'技能与战斗'},{id:'inventory',label:'资产与物品'},{id:'journal',label:'经历与神话'}];
export const id=()=>globalThis.crypto?.randomUUID?.()||`coc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function rollCocAttributes(age,die){const a={};for(const k of Object.keys(ATTRIBUTES))a[k]=(['siz','int','edu'].includes(k)?die()+die()+6:die()+die()+die())*5;if(age>=15&&age<=19)a.luck=Math.max(a.luck,(die()+die()+die())*5);return a;}
const num=(v,d=0)=>v===''||v==null?d:Number.isFinite(Number(v))?Number(v):d;
const text=v=>String(v??'').slice(0,20000);
export function createCoc(raw={}) {
  const now=new Date().toISOString();
  return normalizeCoc({id:id(),name:'新调查员',player:'',ruleset:COC_RULESET,createdAt:now,updatedAt:now,...raw});
}
export function normalizeCoc(raw={}) {
  const attributes=Object.fromEntries(Object.keys(ATTRIBUTES).map(k=>[k,Math.max(0,Math.min(999,Math.trunc(num(raw.attributes?.[k],50))))]));
  const c={schemaVersion:'coc7-1',id:text(raw.id)||id(),ruleset:COC_RULESET,createdAt:raw.createdAt||new Date().toISOString(),updatedAt:raw.updatedAt||new Date().toISOString(),attributes};
  for(const k of ['name','player','gender','residence','birthplace','time','occupation','occupationId','occupationNotes','appearance','belief','importantPeople','places','treasures','traits','scars','phobias','story','keyConnection','notes','armorName','armorCoverage','assetNotes','vehicleNotes','currency'])c[k]=text(raw[k]);
  c.era=text(raw.era)||'1920s'; c.age=Math.max(1,num(raw.age,25));c.currency ||= '美元';c.occupationTemplateVersion=num(raw.occupationTemplateVersion);
  c.portrait=/^data:image\/(png|jpeg|webp);base64,/.test(raw.portrait||'')&&raw.portrait.length<1800000?raw.portrait:'';
  c.skills=(Array.isArray(raw.skills)?raw.skills:catalog.coreSkills.map(s=>({...s,specialty:s.defaultSpecialization}))).slice(0,250).map(s=>({id:text(s.id)||id(),label:text(s.label),specialty:text(s.specialty),base:num(s.base),baseRule:['dexHalf','edu'].includes(s.baseRule)?s.baseRule:'',specialization:!!s.specialization,baseOverride:s.baseOverride===''||s.baseOverride==null?null:num(s.baseOverride),occupation:num(s.occupation),interest:num(s.interest),growth:num(s.growth),checked:!!s.checked,occupational:!!s.occupational,notes:text(s.notes),occupationAuto:s.occupationAuto?{specialty:text(s.occupationAuto.specialty),base:num(s.occupationAuto.base),baseRule:text(s.occupationAuto.baseRule)}:null}));
  c.overrides=Object.fromEntries(['hpMax','mpMax','sanMax','mov','db','build','occupationPoints','interestPoints'].map(k=>[k,raw.overrides?.[k]===''||raw.overrides?.[k]==null?null:k==='db'?text(raw.overrides[k]):num(raw.overrides[k])]));
  for(const k of ['hp','mp','san','cash','assets','spending']) c[k]=raw[k]==null||raw[k]===''?null:num(raw[k]);
  for(const k of ['tempHp','sanLost','armor','armorPenalty','bonusPoints'])c[k]=num(raw[k]);
  c.applyArmorPenalty=!!raw.applyArmorPenalty;c.health=text(raw.health)||'健康';c.sanityState=text(raw.sanityState)||'清醒';
  const schemas={weapons:['name','type','skill','damage','range','impale','attacks','ammo','malfunction','chance','notes','era'],items:['name','state','location','quantity','description'],experiences:['module','changes','notes'],mythos:['name','result','notes','loss'],spells:['name','cost','effect'],companions:['name','player','notes','changes','module']};
  for(const [key,fields] of Object.entries(schemas))c[key]=(Array.isArray(raw[key])?raw[key]:key==='weapons'?[{name:'徒手',skill:'斗殴',damage:'1D3+DB',range:'接触',attacks:'1'}]:[]).slice(0,250).map(r=>({id:text(r.id)||id(),...Object.fromEntries(fields.map(k=>[k,text(r[k])]))}));
  return c;
}
// Evaluate the twelve imported formula shapes, never arbitrary Excel or JavaScript.
export function occupationPoints(formula,a) {
  const term=s=>{const m=s.match(/^(STR|CON|SIZ|DEX|APP|INT|POW|EDU)\*(\d+)$/);if(!m)throw Error('职业点数公式需手动填写');return num(a[m[1].toLowerCase()])*Number(m[2]);};
  const f=String(formula||'=EDU*4').replace(/^=/,'');
  if(!f.includes('+'))return term(f);
  const at=f.indexOf('+'),rhs=f.slice(at+1);
  return term(f.slice(0,at))+(rhs.startsWith('MAX(')&&rhs.endsWith(')')?Math.max(...rhs.slice(4,-1).split(',').map(term)):term(rhs));
}
export const skillName=s=>s.specialty?`${s.label.replace(/[①②③：]/g,'')}：${s.specialty}`:s.label;
export const skillGroup=label=>String(label).replace(/[①②③：Ω\s]/g,'');
const specialtyAliases={'生物':'生物学','动物':'动物学','植物':'植物学','地质':'地质学','天文':'天文学','物理':'物理学','工程':'工程学','司法':'司法科学','制药':'药学','制图':'技术制图','鞭':'鞭子','链锯':'电锯','步/霰':'步枪/霰弹枪','来复':'步枪/霰弹枪','霰弹':'步枪/霰弹枪','拉丁':'拉丁语','希伯来':'希伯来语','飞行':'飞行器'};
const ambiguousSpecialties=new Set(['表','演','类','乐器','置换','欧洲','艇船球','驯养']);
function templateSpecialty(mark){if(!mark||/[★☆⊙☯※=]/.test(mark)||ambiguousSpecialties.has(mark))return '';return specialtyAliases[mark]||mark;}
export function skillCandidates(s){
  if(!s?.specialization)return catalog.skills.filter(e=>e.fields.初始值!=='——');
  const group=skillGroup(s.label),names=catalog.skillOptions?.[group]||[];
  return names.map(name=>catalog.skills.find(e=>e.name===name)||{id:`coc7:skill-option:${group}:${name}`,name,fields:{初始值:group==='技艺'?'5%':group==='生存'?'10%':'1%'}});
}
export function syncSkillBase(s){
  const name=s.specialization?s.specialty:s.label,entry=skillCandidates(s).find(e=>skillGroup(e.name)===skillGroup(name));
  if(entry){s.baseRule=/DEX/.test(entry.fields.初始值)?'dexHalf':/EDU/.test(entry.fields.初始值)?'edu':'';s.base=parseFloat(entry.fields.初始值)||0;s.notes=entry.fields.说明||'';}
  else if(s.specialization){const group=skillGroup(s.label);s.baseRule=group==='母语'?'edu':'';s.base=group==='技艺'?5:group==='生存'?10:1;s.notes='';}
  else{s.baseRule='';s.base=0;s.notes='';}
}
export function occupationChoices(c){
  const e=catalog.occupations.find(e=>e.id===c.occupationId);if(!e)return [];
  return ['☆','⊙','☯','※','任意特长'].filter(k=>num(e.marks[k])>0).map(key=>{
    const candidates=Object.entries(e.marks).filter(([label,mark])=>label!==key&&mark.includes(key)).map(([label])=>label);
    const selected=c.skills.filter(s=>s.occupational&&(key==='任意特长'?!e.marks[s.label]:candidates.some(l=>skillGroup(l)===skillGroup(s.label)))).length;
    return {key,count:num(e.marks[key]),selected,candidates};
  });
}
export function matchingOccupation(name,currentId){const matches=catalog.occupations.filter(e=>e.name===name);return matches.find(e=>e.id===currentId)||(matches.length===1?matches[0]:null);}
export function skillValue(c,s){const base=s.baseOverride??(s.baseRule==='dexHalf'?Math.floor(c.attributes.dex/2):s.baseRule==='edu'?c.attributes.edu:s.base);return {base,total:base+num(s.occupation)+num(s.interest)+num(s.growth)};}
export function deriveCoc(c) {
  const a=c.attributes,sum=a.str+a.siz,age=c.age;
  const build=sum<=64?-2:sum<=84?-1:sum<=124?0:sum<=164?1:sum<=204?2:3+Math.floor((sum-205)/80);
  const db=build<1?String(build):build===1?'+1D4':`+${build-1}D6`;
  const baseMov=a.str<a.siz&&a.dex<a.siz?7:a.str>a.siz&&a.dex>a.siz?9:8;
  const agePenalty=age<40?0:Math.floor(age/10)-3;
  const occ=catalog.occupations.find(o=>o.id===c.occupationId),skill=c.skills.find(s=>s.label==='克苏鲁神话');
  const auto={hpMax:Math.floor((a.con+a.siz)/10),mpMax:Math.floor(a.pow/5),sanMax:Math.max(0,99-(skill?skillValue(c,skill).total:0)),mov:Math.max(0,baseMov-agePenalty-(c.applyArmorPenalty?c.armorPenalty:0)),db,build,occupationPoints:occupationPoints(occ?.formula,a),interestPoints:a.int*2};
  const d={...auto};for(const k of Object.keys(auto))if(c.overrides[k]!==null&&c.overrides[k]!==undefined)d[k]=c.overrides[k];
  d.hp=c.hp??d.hpMax;d.mp=c.mp??d.mpMax;d.san=c.san??a.pow;d.majorWound=Math.ceil(d.hpMax/2);d.occupationRemaining=d.occupationPoints-c.skills.reduce((n,s)=>n+s.occupation,0);d.interestRemaining=d.interestPoints-c.skills.reduce((n,s)=>n+s.interest,0);d.growth=c.skills.reduce((n,s)=>n+s.growth,0);d.auto=auto;d.occupation=occ;d.ageHint=age<15?'15岁以下的年龄调整请与KP商定。':age<20?'15–19岁：力量与体型合计减5、教育减5；幸运掷两次取较高。':age<40?'教育增强检定1次；结果自行填写。':`${Math.min(4,Math.floor(age/10)-2)}次教育增强；年龄属性扣减请按原表提示自行分配，移动减值已自动计算。`;
  return d;
}
export function chooseOccupation(c,e){
  const same=!!e&&c.occupationId===e.id;
  if(same&&c.occupationTemplateVersion===2)return;
  c.occupationTemplateVersion=2;
  c.occupationId=e?.id||'';c.occupation=e?.name||c.occupation;c.occupationNotes=e?.fields.本职技能||'';
  for(const s of c.skills){
    const old=s.occupationAuto;
    if(old&&s.specialty===old.specialty&&s.base===old.base&&s.baseRule===old.baseRule){s.specialty='';syncSkillBase(s);}
    s.occupationAuto=null;
    const mark=e?.marks[s.label]??Object.entries(e?.marks||{}).find(([label])=>skillGroup(label)===skillGroup(s.label))?.[1],specialty=s.specialization?templateSpecialty(mark):'';
    s.occupational=!!e&&(mark==='★'||!!specialty||s.label==='信用评级'||same&&s.occupational);
    if(s.specialization&&!s.specialty&&specialty){s.specialty=specialty;syncSkillBase(s);s.occupationAuto={specialty:s.specialty,base:s.base,baseRule:s.baseRule};}
  }
}
export function chooseSkill(c,s,e){s.specialty=s.specialization?e.name:'';if(!s.specialization)s.label=e.name;s.baseRule=/DEX/.test(e.fields.初始值)?'dexHalf':/EDU/.test(e.fields.初始值)?'edu':'';s.base=parseFloat(e.fields.初始值)||0;s.baseOverride=null;s.notes=e.fields.说明||'';}
export function chooseWeapon(row,e){Object.assign(row,{name:e.name,type:e.name,skill:e.fields.技能,damage:e.fields.伤害,range:e.fields.射程,impale:e.fields.贯穿,attacks:e.fields.每轮,ammo:e.fields.装弹量,malfunction:e.fields.故障值,era:e.fields.常见时代});}
export function weaponChance(c,w){if(w.chance!=='')return num(w.chance);const alias={'弓':'弓术','步霰':'步枪/霰弹枪'};const key=alias[w.skill]||w.skill;const s=c.skills.find(s=>s.specialty===key||s.label===key);return s?skillValue(c,s).total:null;}
export function validateCoc(c){const d=deriveCoc(c),out=[];const add=message=>out.push({id:message,field:'cocWorkspace',message,severity:'warning'});if(!c.name.trim())out.push({id:'name',field:'cocWorkspace',message:'请填写调查员姓名',severity:'error'});if(d.occupationRemaining<0)add('职业点数超支');if(d.interestRemaining<0)add('兴趣点数超支');if(d.san>d.sanMax)add('当前理智超过理智上限');if(d.hp>d.hpMax)add('当前生命超过上限');if(d.mp>d.mpMax)add('当前魔法超过上限');const credit=c.skills.find(s=>s.label==='信用评级'),bounds=d.occupation?.fields.信用范围.match(/(\d+)\s*[-–]\s*(\d+)/);if(credit&&bounds){const value=skillValue(c,credit).total;if(value<+bounds[1]||value>+bounds[2])add(`信用评级不在职业参考范围 ${bounds[0]} 内，可与KP确认后保留。`);}if(c.skills.some(s=>s.occupation>0&&!s.occupational&&s.label!=='信用评级'))add('部分职业点分配给未标记本职的技能；任选技能请手动勾选。');return out;}
export function diceText(c){const d=deriveCoc(c);return '.st '+Object.entries(ATTRIBUTES).map(([k,label])=>`${label.split(' ')[0]}${c.attributes[k]}`).join(' ')+` hp${d.hp} mp${d.mp} san${d.san} `+c.skills.map(s=>`${skillName(s).replace(/[\s：①②③Ω]/g,'')}${skillValue(c,s).total}`).join(' ');}
export function assetReference(c){const credit=c.skills.find(s=>s.label==='信用评级'),cr=credit?skillValue(c,credit).total:0,modern=c.era==='现代';if(!['1920s','现代'].includes(c.era))return null;const tier=cr===0?0:cr<10?1:cr<50?2:cr<90?3:cr<99?4:5;const cash=modern?[10,cr*20,cr*40,cr*100,cr*400,1000000]:[.5,cr,cr*2,cr*5,cr*20,50000],assets=modern?[0,cr*200,cr*1000,cr*10000,cr*40000,100000000]:[0,cr*10,cr*50,cr*500,cr*2000,5000000];return {cash:cash[tier],assets:assets[tier],spending:(modern?[10,40,200,1000,5000,100000]:[.5,2,10,50,250,5000])[tier],level:['身无分文','拮据','标准','小康','富裕','富豪'][tier],currency:'美元'};}
