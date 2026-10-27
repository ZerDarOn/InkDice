export function matchLocalSuggestions(names, query, limit = 8) {
  const term = String(query ?? "").trim().toLocaleLowerCase();
  return names.filter((name) => !term || name.toLocaleLowerCase().includes(term))
    .sort((a, b) => {
      const aStarts = a.toLocaleLowerCase().startsWith(term) ? 0 : 1;
      const bStarts = b.toLocaleLowerCase().startsWith(term) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b, "zh-CN");
    }).slice(0, limit);
}

export function suggestionSearchParams({ ruleset, kind, query, rank = null, limit = kind === 'species' ? 25 : 8, offset = 0 }) {
  const params = new URLSearchParams({ ruleset, kind, query: String(query ?? ""), limit: String(limit), offset: String(offset) });
  if (kind === "spell" && Number.isInteger(rank) && rank >= 0 && rank <= 9) params.set("rank", String(rank));
  return params;
}

export function catalogSpellRanks(name, results) {
  const exactName = String(name ?? "").trim().toLocaleLowerCase();
  return [...new Set(results.filter((entry) => entry.kind === "spell"
    && String(entry.name ?? "").trim().toLocaleLowerCase() === exactName
    && Number.isInteger(Number(entry.rank)))
    .map((entry) => Number(entry.rank)))].sort((a, b) => a - b);
}

export function spellRankConflict(spell, ranks) {
  return !spell.customRank && ranks.length > 0 && !ranks.includes(Number(spell.level));
}

export function weaponPatchFromEntry(entry) {
  if (entry.kind !== "weapon") throw new TypeError("不是武器资料");
  const payload = entry.payload ?? {};
  return {
    properties: String(payload.特性 ?? ""),
    damageDie: String(payload.伤害骰 ?? ""),
    damageType: String(payload.伤害类型 ?? ""),
    ...(payload.精通 ? { mastery: String(payload.精通) } : {}),
  };
}

export function mergeCatalogFields(current, next, previous = {}) {
  const merged = { ...current };
  for (const [field, value] of Object.entries(next)) {
    if (merged[field] === "" || merged[field] == null || merged[field] === previous[field]) merged[field] = value;
  }
  return merged;
}

export function curioPatchFromEntry(entry) {
  if(entry.kind!=='curio')throw new TypeError('不是奇物资料');
  const p=entry.payload||{};
  return {name:String(entry.name||''),rarity:String(p.稀有度||''),properties:String(p.描述||'').slice(0,500)};
}

function sourceFlag(value) {
  if(typeof value==='boolean')return value;
  const text = String(value ?? "").trim();
  return text !== "" && !["x", "×", "-", "—", "0"].includes(text.toLocaleLowerCase());
}

export function spellPatchFromEntry(entry) {
  if (entry.kind !== "spell") throw new TypeError("不是法术资料");
  const p = entry.payload ?? {};
  const duration = String(p.持续时间 ?? "");
  return {
    name: String(entry.name ?? ""),
    level: Number(entry.rank ?? p.环阶 ?? 0),
    source: String(entry.sourceBook ?? p.出处 ?? ""),
    classes: Array.isArray(p.职业列表) ? p.职业列表.join("、") : "",
    school: String(p.学派 ?? ""),
    ritual: sourceFlag(p.仪式),
    concentration: sourceFlag(p.专注) || duration.includes("专注"),
    castingTime: String(p.施法时间 ?? ""),
    range: String(p.施法距离 ?? ""),
    duration,
    verbal: sourceFlag(p["V 言语"]),
    somatic: sourceFlag(p["S 姿势"]),
    materialComponent: sourceFlag(p["M 材料"]),
    material: sourceFlag(p["M 材料"]) ? String(p.材料内容 ?? "") : "",
    effect: String(p.法术详述 ?? ""),
  };
}

export function catalogUnitWeight(entry) {
  const p=entry.payload||{},raw=p.重量;
  let weight=typeof raw==='number'?raw:/^\d+(?:\.\d+)?\s*(?:磅|lb\.?)?$/.test(String(raw??''))?Number(String(raw).match(/\d+(?:\.\d+)?/)[0]):NaN;
  const bundle=entry.ruleset==='dnd5r-2024'&&entry.kind==='item'?String(p.描述||'').trim().match(/^(\d+)\s*(?:支|发|枚)$/):null;
  if(bundle&&Number(bundle[1])>0) weight/=Number(bundle[1]);
  return Number.isFinite(weight)&&weight>=0?weight:undefined;
}
export function itemPatchFromEntry(entry) {
  if (entry.kind !== "item") throw new TypeError("不是物品资料");
  const p = entry.payload ?? {};
  const weight = catalogUnitWeight(entry);
  return {
    name: String(entry.name ?? ""),
    description: String(p.描述 ?? ""),
    ...(Number.isFinite(weight) && weight >= 0 ? { weight } : {}),
  };
}

export function creaturePatchFromEntry(entry) {
  const p=entry.payload||{};
  const patch={name:entry.name};
  for(const [field,key] of Object.entries({size:'体型',type:'类型',alignment:'阵营',armorClass:'AC',hitPoints:'HP',currentHitPoints:'HP',hitDice:'HD',initiative:'先攻',speed:'速度',traits:'特质',actions:'动作'})) {
    if(p[key]!=null) patch[field]=['armorClass','hitPoints','currentHitPoints','initiative'].includes(field)?Number(p[key])||0:String(p[key]);
  }
  const overview=String(p.概览||'');patch.notes=overview;
  const labels={skills:'技能',resistances:'伤害抗性|抗性',immunities:'伤害免疫|状态免疫|免疫',senses:'感官',languages:'语言',challengeRating:'挑战等级|挑战|CR'};
  for(const [field,label] of Object.entries(labels)) {
    const matches=[...overview.matchAll(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]?\\s*([^\\n]+)`,'g'))];
    patch[field]=matches.map(m=>m[1].trim()).join('；');
  }
  const cr=patch.challengeRating.match(/^\d+(?:\/\d+)?/)?.[0];
  if(cr) { const n=cr.includes('/')?Number(cr.split('/')[0])/Number(cr.split('/')[1]):Number(cr);patch.challengeRating=cr;patch.proficiencyBonus=Math.max(2,2+Math.floor((n-1)/4)); }
  for(const [id,n] of Object.entries(p.六维||{})) if(Number.isFinite(Number(n))) patch[`abilities.${id}`]=Number(n);
  return patch;
}

export function mergeCreatureEntry(record,entry) {
  const next=creaturePatchFromEntry(entry);
  const previous=record.catalogDefaults||{size:'中型',armorClass:10,hitPoints:1,currentHitPoints:1,initiative:0,proficiencyBonus:2,...Object.fromEntries(['str','dex','con','int','wis','cha'].map(id=>[`abilities.${id}`,10]))};
  for(const [field,value] of Object.entries(next)) {
    const [group,key]=field.split('.');const current=key?record[group]?.[key]:record[field];
    if(field==='name'||current==null||current===''||current===previous[field]) {
      if(key) {record[group]||={};record[group][key]=value;}else record[field]=value;
    }
  }
  record.catalogDefaults=next;
}
