import {spellClassNames} from './character-rules.mjs';
export const PACK_KEY='inkdice.content-packs.v1';
export const PACK_KINDS={spell:'法术',weapon:'武器',armor:'护甲／防护物',curio:'奇物',item:'普通物品',reference:'参考正文'};
const systems=['dnd5e-2014','dnd5r-2024','coc-7e'];
const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
const fail=message=>{throw Error(message);};
function only(object,keys){if(!plain(object)||Object.keys(object).some(k=>!keys.includes(k)))fail('资料包包含未知字段或可执行扩展；当前仅支持纯资料协议 v1');}
function str(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${label}不能为空且最多 ${max} 字`);return v.trim();}
export function validatePack(raw){
  only(raw,['format','schemaVersion','id','name','version','author','entries']);
  if(raw.format!=='inkdice-content-pack'||raw.schemaVersion!==1)fail('请导入 inkdice-content-pack v1 JSON 资料包');
  const id=str(raw.id,60,'资料包 ID');if(!/^[a-z0-9][a-z0-9._-]*$/.test(id))fail('资料包 ID 仅支持小写英文、数字、点、横线与下划线');
  const name=str(raw.name,80,'名称'),version=str(raw.version,30,'版本'),author=str(raw.author,80,'作者');
  if(!Array.isArray(raw.entries)||!raw.entries.length||raw.entries.length>2000)fail('每个包须包含 1–2000 条资料');
  const ids=new Set();
  const entries=raw.entries.map(e=>{
    only(e,['id','ruleset','kind','name','rank','payload']);
    const entryId=str(e.id,80,'条目 ID');if(!/^[a-zA-Z0-9._-]+$/.test(entryId)||ids.has(entryId))fail('条目 ID 无效或重复');ids.add(entryId);
    if(!systems.includes(e.ruleset)||!Object.hasOwn(PACK_KINDS,e.kind))fail('未知规则或资料类别');
    if(e.ruleset==='coc-7e'&&!['weapon','armor','reference'].includes(e.kind))fail('CoC 扩展暂支持武器、防护物与参考正文');
    const entryName=str(e.name,120,'条目名称');
    if(e.kind==='spell'&&(!Number.isInteger(e.rank)||e.rank<0||e.rank>9))fail('法术须填写 0–9 的环阶');
    if(e.kind!=='spell'&&e.rank!=null)fail('只有法术可以设置环阶');
    if(!plain(e.payload)||Object.keys(e.payload).length>50)fail('payload 须为最多 50 个字段的对象');
    const payload={};for(const [key,value] of Object.entries(e.payload)){
      if(['__proto__','prototype','constructor'].includes(key)||key.length>60)fail('无效的资料字段名');
      if(key==='职业列表'&&Array.isArray(value)&&value.length<=30&&value.every(v=>typeof v==='string'&&v.length<=60)){payload[key]=value.slice();continue;}
      if(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>20000)fail('资料字段仅支持文本、有限数字和布尔值；不支持脚本或规则效果');
      payload[key]=value;
    }
    if(e.kind==='spell'&&(!Array.isArray(payload.职业列表)||!payload.职业列表.length))fail('法术须包含职业列表，以便按施法职业筛选');
    return {id:entryId,ruleset:e.ruleset,kind:e.kind,name:entryName,rank:e.kind==='spell'?e.rank:null,payload};
  });
  const pack={format:raw.format,schemaVersion:1,id,name,version,author,entries};
  if(JSON.stringify(pack).length>1500000)fail('单包过大，请拆成小于 1.5 MB 的资料包');
  return pack;
}
export class PackRegistry {
  constructor(storage){this.storage=storage;this.packs=[];this.warning='';this.revision=0;try{const saved=JSON.parse(storage.getItem(PACK_KEY)||'[]');if(!Array.isArray(saved)||saved.length>20)throw Error('注册表格式无效');this.packs=saved.map(p=>({pack:validatePack(p.pack),enabled:p.enabled===true}));if(new Set(this.packs.map(p=>p.pack.id)).size!==this.packs.length)throw Error('资料包 ID 重复');}catch{this.warning='本地扩展记录无法读取；原记录已保留，请先导出备份再重置。';}}
  commit(next){if(this.warning)fail(this.warning);if(next.length>20)fail('最多安装 20 个资料包');const serialized=JSON.stringify(next);if(serialized.length>3000000)fail('已安装资料总量超过 3 MB，请先移除不用的包');this.storage.setItem(PACK_KEY,serialized);this.packs=next;this.revision++;}
  install(raw){const pack=validatePack(raw);if(this.packs.some(p=>p.pack.id===pack.id))fail('同 ID 的资料包已安装；请先导出旧包并移除，再安装新版本');this.commit([...this.packs,{pack,enabled:true}]);return pack;}
  enable(id,enabled){if(!this.packs.some(p=>p.pack.id===id))fail('资料包不存在');this.commit(this.packs.map(p=>p.pack.id===id?{...p,enabled:!!enabled}:p));}
  remove(id){if(!this.packs.some(p=>p.pack.id===id))fail('资料包不存在');this.commit(this.packs.filter(p=>p.pack.id!==id));}
  entries(ruleset){return this.packs.filter(p=>p.enabled).flatMap(({pack})=>pack.entries.filter(e=>e.ruleset===ruleset).map(e=>({...e,id:`pack:${pack.id}:${e.id}`,sourceBook:pack.name,sourceFile:pack.name,sourceSheet:pack.version,sourceRange:e.id,domain:'用户扩展',description:String(e.payload.描述||e.payload.正文||e.payload.法术详述||''),provenance:{group:'third_party',groupLabel:'用户扩展（第三方）',book:pack.name,edition:e.ruleset},packId:pack.id})));}
}
let defaultRegistry;
export function contentPacks(){return defaultRegistry??=new PackRegistry(localStorage);}
export async function extendedLibraryRequest(path,baseRead,registry=contentPacks()){
  const u=new URL(path,'http://local'),p=u.searchParams,ruleset=p.get('ruleset'),revision=registry.revision;
  const all=registry.entries(ruleset);
  if(u.pathname.endsWith('/entry')&&p.get('id')?.startsWith('pack:')){const entry=all.find(e=>e.id===p.get('id'));if(!entry)fail('资料包已停用、移除，或不属于当前规则');return entry;}
  if(u.pathname.endsWith('/summary')){const base=await baseRead(path);if(registry.revision!==revision)fail("资料包状态已改变，请重新查询");const counts=new Map(base.kinds.map(k=>[k.kind,{...k}]));for(const e of all){const k=counts.get(e.kind)||{kind:e.kind,label:PACK_KINDS[e.kind],domain:'用户扩展',count:0};k.count++;counts.set(e.kind,k);}return {...base,kinds:[...counts.values()],books:[...(base.books||[]),...Array.from(new Set(all.map(e=>e.sourceBook)),book=>({book,sourceGroup:'third_party'}))],sources:[...base.sources,...Array.from(new Set(all.map(e=>e.sourceBook)),filename=>({filename}))],sourceGroups:{...base.sourceGroups,third_party:'第三方／用户扩展'},totalCells:base.totalCells,extensionEntries:all.length};}
  if(!u.pathname.endsWith('/search')||!all.length)return baseRead(path);
  const context=p.has('context')?JSON.parse(p.get('context')):null;
  const names=context?spellClassNames(context,p.get('castingClassId')||context.classId):null;
  const query=(p.get('query')||'').trim().toLocaleLowerCase();
  const extras=all.filter(e=>(!p.get('kind')||e.kind===p.get('kind'))&&(!p.get('rank')||e.rank===Number(p.get('rank')))&&(!p.get('book')||e.sourceBook===p.get('book'))&&(!p.get('sourceGroup')||p.get('sourceGroup')==='third_party')&&(!p.get('domain')||p.get('domain')===e.domain)&&!p.get('subcategory')&&(!query||(e.name+' '+(!context?e.description:'')).toLocaleLowerCase().includes(query))&&!(e.kind==='spell'&&names!==null&&!e.payload.职业列表.some(n=>names.includes(n))));
  const limit=Math.min(50,Math.max(1,Number(p.get('limit'))||30)),offset=Math.max(0,Number(p.get('offset'))||0),selected=extras.slice(offset,offset+limit);
  p.set('offset',String(Math.max(0,offset-extras.length)));p.set('limit',String(Math.max(1,limit-selected.length)));
  const base=await baseRead(u.pathname+'?'+p);
  if(registry.revision!==revision)fail('资料包状态已改变，请重新查询');
  return {...base,total:base.total+extras.length,results:[...selected,...base.results.slice(0,limit-selected.length)]};
}
