import {COC_CATALOG as catalog} from './catalog.mjs';
export const COC_KINDS={occupation:'职业',skill:'技能',weapon:'武器',armor:'防护物',price:'资产与物价',combat:'战斗参考',vehicle:'防具与载具参考',sanity:'疯狂表',reference:'属性与技能参考',era:'时代参考',experience:'经历包参考'};
const wrap=e=>({...e,ruleset:'coc-7e',rank:null,payload:e.fields,domain:'CoC七版',sourceFile:catalog.source,sourceBook:catalog.source,sourceGroup:'workbook',description:Object.values(e.fields).join('\n'),categoryWarning:catalog.notice});
export function cocLibraryRequest(path){
  const u=new URL(path,'http://local'),p=u.searchParams;
  if(p.get('ruleset')!=='coc-7e')throw Error('CoC资料不可跨系统读取');
  if(u.pathname.endsWith('/summary'))return {ruleset:'coc-7e',sources:[{filename:catalog.source}],kinds:Object.entries(COC_KINDS).map(([kind,label])=>({kind,label,count:catalog.entries.filter(e=>e.kind===kind).length,domain:'CoC七版'})),books:[{book:catalog.source,sourceGroup:'workbook'}],sourceGroups:{workbook:'用户提供工作簿'},totalCells:catalog.entries.length};
  if(u.pathname.endsWith('/entry')){const e=catalog.entries.find(e=>e.id===p.get('id'));if(!e)throw Error('没有这条CoC资料');return wrap(e);}
  if(u.pathname.endsWith('/search')){
    const q=(p.get('query')||'').toLowerCase(),kind=p.get('kind');
    const sourceMatches=(!p.get('book')||p.get('book')===catalog.source)&&(!p.get('sourceGroup')||p.get('sourceGroup')==='workbook')&&(!p.get('domain')||p.get('domain')==='CoC七版')&&!p.get('rank');
    const all=sourceMatches?catalog.entries.filter(e=>(!kind||e.kind===kind)&&(!q||`${e.name}\n${Object.values(e.fields).join('\n')}`.toLowerCase().includes(q))):[];
    if(q){const rank=e=>e.name.toLowerCase()===q?0:e.name.toLowerCase().startsWith(q)?1:e.name.toLowerCase().includes(q)?2:3;all.sort((a,b)=>rank(a)-rank(b));}
    const offset=Math.max(0,Number(p.get('offset'))||0),limit=Math.min(100,Math.max(1,Number(p.get('limit'))||30));return {ruleset:'coc-7e',total:all.length,results:all.slice(offset,offset+limit).map(wrap)};
  }
  throw Error('CoC 不使用 D&D 职业升级接口');
}
