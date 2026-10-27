export const ARTISAN_TOOLS=['炼金工具','酿酒工具','书法工具','木匠工具','制图工具','鞋匠工具','厨师工具','玻璃匠工具','珠宝匠工具','皮匠工具','石匠工具','画家工具','陶匠工具','铁匠工具','修补工具','织布工具','木雕工具'];
import { CLASSES } from './content.mjs';
import { characterClasses } from './character-rules.mjs';
import { featChoiceKey } from './advancement.mjs';
export const INSTRUMENTS=['风笛','鼓','扬琴','长笛','鲁特琴','里拉琴','号角','排箫','芦笛','提琴'];
export const GAMING_SETS=['骰子','龙棋','纸牌','三龙牌'];
export const TOOL_OPTIONS=[...ARTISAN_TOOLS,...INSTRUMENTS,...GAMING_SETS,'易容工具','文书伪造工具','草药工具','领航工具','制毒工具','盗贼工具','载具（陆运）','载具（水运）','载具（空运）','载具（太空）'];
export const LANGUAGE_OPTIONS=['通用语','矮人语','精灵语','巨人语','侏儒语','地精语','半身人语','兽人语','龙语','深渊语','天界语','深潜语','炼狱语','原初语','木族语','地底通用语'];
export const STANDARD_LANGUAGES_2024=['通用手语','龙语','矮人语','精灵语','巨人语','侏儒语','地精语','半身人语','兽人语'];
export const ALL_LANGUAGES_2024=[...new Set([...LANGUAGE_OPTIONS,...STANDARD_LANGUAGES_2024,'德鲁伊语','盗贼黑话'])];
const aliases={'匠人工具':'工匠工具','游戏组':'赌具','赌博工具':'赌具','皮革匠工具':'皮匠工具','毒药工具':'制毒工具','领航者工具':'领航工具','航海工具':'领航工具'};
const clean=s=>{s=String(s||'').trim();for(const [a,b] of Object.entries(aliases)) s=s.replaceAll(a,b);return s;};
const split=s=>String(s||'').split(/[，,、；;\n]+/).map(s=>s.trim()).filter(Boolean);
const count=text=>{const m=text.match(/([一二两三123])(?:种|门|项|套|个)/);return m?({'一':1,'二':2,'两':2,'三':3})[m[1]]||Number(m[1]):0;};
const hash=text=>{let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(16);};
export function parseProficiencyGrant(raw,kind) {
  let text=clean(raw);if(!text||/^(?:无|[-—])$/.test(text)) return {fixed:[],groups:[],review:''};
  const review=()=>({fixed:[],groups:[],review:`原文含条件或未识别选项，未自动授予：${raw}`});
  // A conditional grant is kept whole: extracting only a familiar noun can grant the wrong benefit.
  if(/如果|替换|必须|其中|视|家族|有关|经常|故乡|推荐|三项中|选择两项|选择两门/.test(text)) return review();
  if(kind==='language') {
    if(!/选|任意|另一|一门|两门|一种|两种/.test(text)) {
      const fixed=text.replace(/[。.]+$/,'').split(/[，,、和与]/).map(s=>s.trim()).filter(Boolean);
      return fixed.every(s=>/^[\u4e00-\u9fff]{1,12}语$/.test(s))?{fixed,groups:[],review:''}:review();
    }
    let fixed=[];
    const prefix=text.match(/^([\u4e00-\u9fff]{1,12}语)和另一门/);
    if(prefix){fixed=[prefix[1]];text='自选一门语言';}
    const number=count(text);if(!number) return review();
    const isPool=/^(?:从|在)/.test(text);
    const options=isPool?text.replace(/^(?:从|在)/,'').replace(/中(?:任选|选择).*$/,'').split(/[，,、或和与]/).map(s=>s.trim()).filter(Boolean):LANGUAGE_OPTIONS;
    // Pool words must end at punctuation; unparsed annotations require manual review.
    if(isPool&&(!options.length||!options.every(s=>/^[\u4e00-\u9fff]{1,12}语$/.test(s)))) return review();
    return {fixed,groups:[{count:number,options,custom:!isPool}],review:''};
  }
  text=text.replace(/（比如[^）]*）/g,'').replace(/[。.]+$/,'');
  const choice=/工匠工具|乐器|赌具/.test(text)&&/一|两|二|三|选择|自选|任选/.test(text);
  if(!choice&&!/或|选择|自选/.test(text)) {
    const fixed=split(text);return fixed.every(s=>TOOL_OPTIONS.includes(s))?{fixed,groups:[],review:''}:review();
  }
  // Explicit finite disjunction, e.g. "书法工具或炼金工具".
  if(!choice&&text.includes('或')) {
    const options=text.split(/或者?|[，,、]/).map(s=>s.trim());
    if(options.every(s=>TOOL_OPTIONS.includes(s))) return {fixed:[],groups:[{count:1,options,custom:false}],review:''};
    return review();
  }
  const pieces=text.split(/[，,、]/).map(s=>s.trim().replace(/^和(?:另外)?/,''));
  const fixed=[],groups=[];
  if(text.includes('或')) {
    const parts=text.replaceAll('或是','或').replaceAll('，或','或').replace(/^从/,'').replace(/中选择一个$/,'').split('或');
    const options=[];
    for(const part of parts) {
      if(/工匠工具/.test(part)) options.push(...ARTISAN_TOOLS);
      else if(/乐器/.test(part)) options.push(...INSTRUMENTS);
      else if(/赌具/.test(part)) options.push(...GAMING_SETS);
      else return review();
    }
    return {fixed,groups:[{count:1,options:[...new Set(options)],custom:false}],review:''};
  }
  for(const part of pieces) {
    if(TOOL_OPTIONS.includes(part)){fixed.push(part);continue;}
    const options=/工匠工具/.test(part)?ARTISAN_TOOLS:/乐器/.test(part)?INSTRUMENTS:/赌具/.test(part)?GAMING_SETS:null;
    const number=count(part);
    if(!options||!number) return review();
    groups.push({count:number,options,custom:false});
  }
  return {fixed,groups,review:''};
}
export function normalizeProficiencyChoices(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0,100).filter(([key])=>/^dnd5[er]-\d{4}:/.test(key)&&key.length<180).map(([key,v])=>[key,Array.isArray(v)?v.slice(0,6).map(s=>String(s||'').trim().slice(0,80)):[]]));
}
export function proficiencyGrantState(c,features=[],extraTools=[]) {
  const result={tools:split(c.toolProficiencies),languages:split(c.knownLanguages),groups:[],issues:[],fixedTools:[],fixedLanguages:[],sources:[]};
  const source=c.backgroundSource;
  const active=!source||(source.ruleset===c.ruleset&&source.name===c.background);
  if(!active) result.issues.push('旧背景的工具与语言授予已停用，手动来源保留。');
  const choices=normalizeProficiencyChoices(c.proficiencyChoices);
  const grants=[];
  for(const kind of ['tool','language']) {
    const raw=!active?'':kind==='tool'?c.backgroundToolProficiencies||source?.payload?.工具熟练:c.backgroundLanguages||source?.payload?.语言;
    grants.push({kind,raw,id:`${c.ruleset}:background:${kind}:${hash(c.background+'|'+raw)}`,name:`背景${kind==='tool'?'工具':'语言'}`});
  }
  const add=(id,name,kind,fixed=[],groups=[])=>grants.push({id:`${c.ruleset}:${id}`,name,kind,parsed:{fixed,groups,review:''}});
  if(c.ruleset==='dnd5r-2024') add('creation:languages','5R初始语言','language',['通用语'],[{count:2,options:STANDARD_LANGUAGES_2024,custom:false}]);
  for(const [index,item] of characterClasses(c).entries()) {
    const initial=index===0,id=`class:${item.classId}:${initial?'initial':'multiclass'}`,name=`${CLASSES[item.classId]?.name||item.classId}${initial?'初始':'兼职'}`;
    if(item.classId==='bard') add(id+':tools',name+'乐器','tool',[],[{count:initial?3:1,options:INSTRUMENTS,custom:false}]);
    if(item.classId==='monk'&&initial) add(id+':tools',name+'工具','tool',[],[{count:1,options:[...ARTISAN_TOOLS,...INSTRUMENTS],custom:false}]);
    if(item.classId==='rogue') {
      add(id+':tools',name+'工具','tool',['盗贼工具']);
      add('class:rogue:cant', '游荡者盗贼黑话','language',['盗贼黑话'],c.ruleset==='dnd5r-2024'?[{count:1,options:ALL_LANGUAGES_2024,custom:false}]:[]);
    }
    if(item.classId==='druid') {
      if(initial) add(id+':tools',name+'工具','tool',['草药工具']);
      add('class:druid:druidic','德鲁伊语','language',['德鲁伊语']);
    }
    if(item.classId==='artificer'&&initial) add(id+':tools',name+'工具','tool',['盗贼工具','修补工具'],[{count:1,options:ARTISAN_TOOLS,custom:false}]);
    if(item.classId==='artificer'&&!initial&&c.ruleset==='dnd5e-2014') add(id+':tools',name+'工具','tool',['盗贼工具','修补工具']);
    if(item.classId==='ranger'&&item.level>=2&&c.ruleset==='dnd5r-2024') add('class:ranger:deft:2','游侠2级语言','language',[],[{count:2,options:ALL_LANGUAGES_2024,custom:false}]);
  }
  for(const f of features.filter(f=>f.kind==='feat')) {
    const text=String(f.catalogEntry?.payload?.描述??f.description??'');
    if(f.name==='毒师'&&/你获得(?:制毒|毒药)工具的熟练/.test(text)) add(`feat:${featChoiceKey(f,c)}:tools`,'毒师','tool',['制毒工具']);
    if(f.name==='语言学家'&&/三门自选语言/.test(text)) add(`feat:${featChoiceKey(f,c)}:languages`,'语言学家','language',[],[{count:3,options:LANGUAGE_OPTIONS,custom:true}]);
  }
  // Collect every fixed grant first, so a later fixed source cannot silently consume
  // an earlier optional pick. The user can reassign that pick, never a random substitute.
  for(const grant of grants) {
    grant.parsed ||= parseProficiencyGrant(grant.raw,grant.kind);
    const fixed=grant.kind==='tool'?result.fixedTools:result.fixedLanguages;
    fixed.push(...grant.parsed.fixed);
    for(const value of grant.parsed.fixed) result.sources.push({name:grant.name,value,kind:grant.kind});
  }
  result.tools.push(...result.fixedTools);result.languages.push(...result.fixedLanguages);
  for(const grant of grants) {
    const {kind,parsed}=grant,target=kind==='tool'?result.tools:result.languages;
    if(parsed.review) result.issues.push(`${grant.name}：${parsed.review}`);
    for(const [index,spec] of parsed.groups.entries()) {
      const id=`${grant.id}:${index}`;
      const group={...spec,id,kind,name:`${grant.name}${parsed.groups.length>1?' '+(index+1):''}`,selected:choices[id]||[],valid:[],errors:[]};
      for(const [i,value] of group.selected.entries()) {
        if(!value) continue;
        if(i>=group.count||(!spec.custom&&!spec.options.includes(value))){group.errors.push(`${value}不在允许范围`);continue;}
        if(/盗贼黑话|德鲁伊语/.test(value)&&!spec.options.includes(value)){group.errors.push(`${value}需要特定能力授予`);continue;}
        if(target.includes(value)){group.errors.push(`${value}已由其他来源获得，请改选`);continue;}
        group.valid.push(value);target.push(value);
      }
      if(group.valid.length<group.count) group.errors.push(`已选 ${group.valid.length} / ${group.count}`);
      if(spec.custom) group.note='自选语言可输入团设名称；稀有语言仍需DM允许，不因此获得秘密语言。';
      result.groups.push(group);result.issues.push(...group.errors.map(e=>`${group.name}：${e}`));
    }
  }
  result.tools=[...new Set([...result.tools,...extraTools])];result.languages=[...new Set(result.languages)];
  result.fixedTools=[...new Set(result.fixedTools)];result.fixedLanguages=[...new Set(result.fixedLanguages)];return result;
}
