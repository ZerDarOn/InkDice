// Verified paths in the supplied CHM, not fuzzy matches against monster entries.
// Source text remains authoritative; optional alternatives remain a single choice.
const PHB='玩家手册/种族/';
const MTF='魔邓肯的众敌卷册/玩家可用种族/';
const ERLW='艾伯伦：从终末战争中崛起/';
const SCAG='剑湾冒险者指南/种族/';
const MOTM='多元宇宙的怪物/种族/';
const cleanName=s=>String(s||'').replace(/\.html?$/,'').replace(/_.*$/,'').replace(/\s/g,'');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function speciesText(body) {
  let b=String(body||'').replace(/\r/g,'');
  let previous;
  do {
    previous=b;
    b=b.replace(/^(#{3,6}\s+[^\n]+)\n\s*#{3,6}\s+([A-Za-z’'：（）():][^\n]*)/gm,'$1 $2')
      .replace(/^(#{3,6}\s+[\p{Script=Han}]{1,2})\n\s*#{3,6}\s+([\p{Script=Han}][^\n]*)/gmu,'$1$2');
  }while(b!==previous);
  return b;
}

// Slice by actual section headings, including old translations which omitted
// HTML heading tags. No search for an arbitrary mention in lore paragraphs.
function section(body,start,end) {
  const match=new RegExp('^(?:#{1,6}\\s*)?(?:'+start+')[^\\n]*','m').exec(body);
  if(!match) return '';
  let text=body.slice(match.index+match[0].length);
  if(end) {const stop=new RegExp('^(?:#{1,6}\\s*)?(?:'+end+')[^\\n]*','m').exec(text);if(stop)text=text.slice(0,stop.index);}
  return text.trim();
}
function parts(text,{only,groupAfter,nested=[]}={}) {
  if(!text) return [];
  const markers=[];
  for(const m of text.matchAll(/^#{3,6}\s+([^\n]+)\n/gm)) {
    const name=m[1].split(/[A-Za-z（(]/)[0].replace(/[：:。．\s]+$/,'').trim();
    if(name && /[\p{Script=Han}]/u.test(name)) markers.push({name,index:m.index,end:m.index+m[0].length});
  }
  // Chinese-only and bilingual labels, sometimes wrapped inside an English title.
  const label=/(?:^|\n)([\p{Script=Han}]{2,12})(?:[（(][^\n）)]{1,35}[）)])?(?:\s*[A-Za-z][A-Za-z\s’'\-/]*?)?[ \t]*[。．：:.][ \t]*/gu;
  for(const m of text.matchAll(label)) {
    const index=m.index+(m[0][0]==='\n'?1:0);
    if(/^(?:你|当|从|以|在|一旦|此|该|如果|尺内|岁左右|存在|属性$)|拥有|通常|寿命|倾向|体型调整|规则提醒/.test(m[1]))continue;
    if(!markers.some(h=>index>=h.index&&index<h.end)) markers.push({name:m[1],index,end:m.index+m[0].length});
  }
  markers.sort((a,b)=>a.index-b.index);
  let chosen=markers.filter(m=>(!only || only.includes(m.name)) && !nested.includes(m.name) && !/^(?:引用|装填|边栏|心灵传信|遥远视野|戏法$)/.test(m.name));
  if(groupAfter) {const end=chosen.findIndex(m=>m.name===groupAfter);if(end>=0)chosen=chosen.slice(0,end+1);}
  return chosen.map((m,i)=>({name:m.name,description:text.slice(m.end,chosen[i+1]?.index??text.length).trim().replace(/^[。．：:]\s*/,'')}))
    .filter(p=>p.description && (!['年龄','阵营','寿命','亚种'].includes(p.name) || (p.name==='年龄' && /免疫魔法老化/.test(p.description))));
}
const aliases={
  '半人马':['人马','人马（半人马）'], '纯种蛇人':['原体蛇人','纯血原体蛇人'],
  '战俑（机关人）':['战俑'], '枭人':['种族-枭人'], '析米克混生体':['析米克杂拼体'],
  '诘弗人（河马人）':['诘弗人'],
};
const pinned={
  '战俑（机关人）':ERLW+'种族/战俑.html', '离梦人':ERLW+'种族/离梦人.html',
  '析米克混生体':'拉尼卡公会长指南/种族/析米克杂拼体.html',
  '象族':'拉尼卡公会长指南/种族/象族.html',
  '枭人':'斯翠海文：混沌研习/玩家选项/种族-枭人.html',
  '狮族':'塞洛斯之神话奥德赛/角色选项/种族/狮族.htm',
  '牛头人_塞洛斯':'塞洛斯之神话奥德赛/角色选项/种族/牛头人.htm',
  '牛头人_拉尼卡':'拉尼卡公会长指南/拉尼卡公会指南重置版/牛头人.htm',
  '地底侏儒_魔邓肯':MTF+'侏儒亚种（玩家可选）.html',
  '灰矮人_魔邓肯':MTF+'灰矮人角色（玩家可选）.html',
  '雅灵_魔邓肯':MTF+'精灵-亚种（玩家可选）.html',
  '海精灵_魔邓肯':MTF+'精灵-亚种（玩家可选）.html',
  '影灵_魔邓肯':MTF+'精灵-亚种（玩家可选）.html',
  '鬼智半身人_剑湾':SCAG+'鬼智半身人.htm',
  '莲源半身人_荒洲':'荒洲探险家指南/玩家选项/种族/半身人-莲源半身人.htm',
};
for(const name of ['流浆体','自动侏儒','螳螂人','鼯猴人'])pinned[name]=`星界冒险者指南/${name}.htm`;
pinned['诘弗人（河马人）']='星界冒险者指南/诘弗人.htm';
for(const name of ['半血裔','复生者','巫咒之子'])pinned[name]=`范·里希腾的鸦阁魔域指南/角色创建/${name}.htm`;

export function mappedSpecies(context,selected,sub,species,allRefs,parsePHB,makeEntries) {
  const refs=allRefs.filter(r=>!/(?:第三方|\/UA\/|图鉴\/|\/生物\/|布布的星界|过时)/.test(r.source_sheet));
  const warnings=[],sourceChoices=[],entries=[];
  const target=sub||selected, name=target.name, simple=cleanName(name), family=target.payload.族系;
  const get=path=>refs.find(r=>r.source_sheet===path);
  const add=(source,ps,option=name)=>{
    if(!source || !ps.length){warnings.push(`${option}：未找到已核对的特性正文，未凭目录补写。`);return;}
    entries.push(...makeEntries(source,'species_feature',ps,{species:context.species,subrace:sub?context.subrace:'',speciesOption:option,sourceChoice:family==='元素裔'?'元素裔':option}));
  };
  const base=(fam=family,remove=[])=>{
    const source=get(PHB+fam+'.html');
    if(source)add(source,parsePHB(source.payload.正文,fam,{base:true,boundaries:species.map(s=>cleanName(s.name)).concat('黑暗精灵','罕见种族')}).filter(p=>!remove.includes(p.name)),fam);
  };
  const pick=(option,candidates)=>{
    const explicit=candidates.find(r=>r.id===context.speciesReferences?.[option]);
    if(explicit)return explicit;
    if(candidates.length===1)return candidates[0];
    if(candidates.length>1)sourceChoices.push({name:option,options:candidates.map(r=>({id:r.id,label:r.source_sheet}))});
    return null;
  };
  const finish=()=>({entries,warnings,sourceChoices});
  if(name==='类地精') {warnings.push('类地精是族系分组，请选择地精、熊地精或大地精。');return finish();}

  if(name.endsWith('_艾伯伦')) {
    const source=get(ERLW+'龙纹/'+simple+'.html');
    const body=speciesText(source?.payload.正文),block=section(body,'[^\n]*'+escape(simple)+' (?:Variant|Halfling|Dwarf|Gnome)');
    if(simple==='探索龙纹')base(family,['属性值加成','黑暗视觉','语言','凶恶','坚韧不屈','凶蛮攻击']);
    else base(family,family==='人类'?['属性值加成']:family==='半精灵'?['属性值加成','多才多艺']:[]);
    const ps=parts(block);
    // One archived paragraph omits punctuation after this label.
    const last=ps.at(-1);
    if(last?.description.includes('龙纹法术如果')) {
      const [before,after]=last.description.split('龙纹法术如果');last.description=before.trim();ps.push({name:'龙纹法术',description:'如果'+after});
    }
    add(source,ps);return finish();
  }
  if(/血统_剑湾$/.test(name)) {
    base('半精灵',['多才多艺']);
    const source=get(SCAG+'半精灵变体.htm'),b=source?.payload.正文||'';
    const prefix=simple==='日&月精灵血统'?'拥有月精灵血统或者日精灵血统':'拥有'+simple;
    const line=b.split('\n').find(l=>l.startsWith(prefix));
    add(source,line?[{name:simple+'（自选）',description:'在 DM 允许下，以下选项取代“多才多艺”；按原文选择其中一项，不同时获得所有选项。\n'+line}]:[]);return finish();
  }
  if(name==='提夫林变体_剑湾') {
    // No variant is silently selected. Keep the entire mutually-exclusive rule
    // with its replacement instructions instead of granting four alternatives.
    base('提夫林');const source=get(SCAG+'提夫林变体.htm');
    add(source,[{name:'提夫林变体（待选择）',description:source?.payload.正文||''}]);
    warnings.push('提夫林变体须经 DM 允许；请选定选项后替换对应基础特性。魔鬼之舌、地狱之火、飞翼不可兼得。');return finish();
  }
  if(/^(巴尔泽布|迪斯帕特|菲尔娜|格莱西雅)_/.test(name)) {
    base('提夫林',['属性值加成','地狱遗赠']);
    const source=get(MTF+'提夫林亚种（玩家可选）.html');
    const text=section(speciesText(source?.payload.正文),simple,'巴尔泽布|迪斯帕特|菲尔娜|格莱西雅|莱维|莱瓦|列维|马曼|墨菲斯托菲利斯|扎瑞尔|译者注');
    add(source,parts(text));return finish();
  }
  if(/^(守护|天罚|堕落)阿斯莫$/.test(name)) {
    const source=get('瓦罗怪物指南/玩家可用种族/阿斯莫.html'),b=speciesText(source?.payload.正文);
    add(source,parts(section(b,'阿斯莫特性','亚种[：:]?')),'阿斯莫');
    add(source,parts(section(b,name+'$','守护阿斯莫$|天罚阿斯莫$|堕落阿斯莫$|边栏')));return finish();
  }
  if(/^(兽皮|长牙|迅捷|猎食)化兽者$/.test(name)) {
    const source=get(ERLW+'种族/化兽者.html'),b=speciesText(source?.payload.正文);
    add(source,parts(section(b,'化兽者特性','亚种')),'化兽者');
    add(source,parts(section(b,name.replace('化兽者','')+'[：:]?$','兽皮[：:]?$|长牙[：:]?$|迅捷[：:]?$|猎食[：:]?$'),{only:['属性加值','天生运动健将','凶狠角色','优雅之人','大自然追踪者','化形特点']}));return finish();
  }
  if(/^[红绿蓝金银黑]龙裔$/.test(name)) {
    base('龙裔');
    const source=get(PHB+'龙裔.html'),b=source?.payload.正文||'';
    const row=b.split('\n').find(l=>new RegExp('^\\|\\s*'+name[0]+'(?:龙)?\\s*\\|').test(l));
    add(source,row?[{name:'龙族血统：'+name[0]+'龙',description:'按所选龙族血统使用吐息武器及伤害抗性：\n| 龙种 | 伤害类型 | 吐息武器 |\n| --- | --- | --- |\n'+row}]:[]);return finish();
  }
  if(family==='元素裔') {
    const source=pick('元素裔',[get(MOTM+'元素裔.html'),get('荒洲探险家指南/玩家选项/种族/元素裔.html')].filter(Boolean));
    if(!source)return finish();const b=speciesText(source.payload.正文);
    if(name==='元素裔') {warnings.push('请选择气、土、火或水元素裔；不会同时授予四种元素的特性。');return finish();}
    if(!source.source_sheet.startsWith(MOTM))add(source,parts(section(b,'元素裔特性','气元素裔|土元素裔|火元素裔|水元素裔').split(/\n亚种\s/)[0]),'元素裔');
    add(source,parts(section(b,name+'(?:特质)?(?:[ \t]|$)','[气土火水]元素裔(?:特质)?(?:[ \t]|$)|操水')));return finish();
  }
  if(family==='吉斯人') {
    const legacy=get(MTF+'吉斯人角色（玩家可选）.html');
    const source=name==='吉斯人'?legacy:pick(name,[get(MOTM+name+'.html'),legacy].filter(Boolean));
    if(!source)return finish();const b=speciesText(source.payload.正文);
    if(source===legacy) {
      add(source,parts(section(b,'吉斯人特质','亚种')),'吉斯人');
      if(name!=='吉斯人')add(source,parts(section(b,name+'(?:[ \t]|$)','(?:吉斯洋基人|吉斯泽莱人)(?:[ \t]|$)|随机身高体重')));
      else warnings.push('请选择吉斯洋基人或吉斯泽莱人亚种。');
    } else add(source,parts(section(b,name+'特质')));
    return finish();
  }
  if(name.endsWith('_魔邓肯')) {
    const source=get(pinned[name]),b=speciesText(source?.payload.正文);
    base(family,simple==='地底侏儒'||simple==='灰矮人'?['黑暗视觉']:[]);
    const endings={地底侏儒:'地底侏儒可选专长',雅灵:'海精灵',海精灵:'沙华鱼人',影灵:'在最古老的故事中|分裂的种族'};
    const start=simple==='灰矮人'?'灰矮人特性':simple==='地底侏儒'?'地底侏儒特性':simple+'特性';
    add(source,parts(section(b,start,endings[simple]),simple==='雅灵'?{only:['属性值提升','精类步']} : {}));return finish();
  }
  if(name==='鬼智半身人_剑湾'||name==='莲源半身人_荒洲') {
    base('半身人');const source=get(pinned[name]);add(source,parts(section(speciesText(source?.payload.正文),simple)));return finish();
  }
  // PHB subraces share a page; do not look for a standalone monster with that name.
  if(['矮人','精灵','侏儒','半身人','人类','半兽人','半精灵','提夫林','龙裔'].includes(family) && !pinned[name]) {
    const source=get(PHB+family+'.html');
    base(family,name==='变体人类'?['属性值加成']:[]);
    if(name!==family)add(source,parsePHB(source?.payload.正文||'',name,{boundaries:species.map(s=>cleanName(s.name)).concat('黑暗精灵','罕见种族')}));
    return finish();
  }
  let source=get(pinned[name]);
  if(!source) {
    const names=[name,...(aliases[name]||[])].map(cleanName);
    const candidates=refs.filter(r=>names.includes(cleanName(r.name)) && /种族|玩家可用种族|角色创建/.test(r.source_sheet));
    source=pick(name,candidates);
    if(!source) {if(!candidates.length)warnings.push(`${name}：缺少已核对的来源。`);return finish();}
  }
  const b=speciesText(source.payload.正文);
  const title={'析米克混生体':'混生体','战俑（机关人）':'战俑','诘弗人（河马人）':'诘弗人','纯种蛇人':cleanName(source.name),'半人马':cleanName(source.name).replace(/（.*$/,'')}[name]||simple;
  let text=section(b,escape(title)+'(?:特质|特性|种族特性|Traits)','边栏|规则提醒|造风术|风墙术');
  if(!text)text=section(b,'[^\n]{0,20}(?:特质|特性) ?[A-Za-z]*');
  if(['阿斯莫','化兽者'].includes(name) && !source.source_sheet.startsWith(MOTM)) {
    text=text.split(/\n(?:#{3,6}\s*)?亚种/)[0];
    warnings.push(`${name}：请再选择对应旧版亚种；当前只导入基础特性。`);
  }
  let ps=parts(text,{groupAfter:name==='化兽者'&&source.source_sheet.startsWith(MOTM)?'化形':name==='阿斯莫'&&source.source_sheet.startsWith(MOTM)?'天启':undefined,
    nested:source.source_sheet.startsWith(MOTM)?['好客','通行','恶意','狡猾','反抗','龙族术法']:[]});
  if(name==='析米克混生体')ps=parts(text,{only:['属性值加成','年龄','阵营','体型','速度','黑暗视觉','语言','动物强化']});
  if(name==='枭人')ps.unshift(...parts(b,{only:['属性值加成','语言','寿命']}).filter(p=>p.name!=='寿命').map(p=>({...p,description:p.description.split(/^####/m)[0].trim()})));
  add(source,ps);return finish();
}
