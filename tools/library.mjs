import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { classifySource, registerProvenance, SOURCE_GROUPS } from './library-provenance.mjs';
import { characterClasses, classIdForName, entryEligibility, spellClassNames } from "../prototype/character-rules.mjs";
import { resolveAdditionalFeatures } from './feature-import.mjs';

export function featureImports(database, options = {}) {
  const ruleset=libraryRuleset(options.ruleset), kind=options.kind;
  if(!['species','class'].includes(kind)) throw new RangeError('未知的能力类型。');
  const context={...JSON.parse(String(options.context || '{}').slice(0,12000)),ruleset};
  const additional=resolveAdditionalFeatures(database,context,kind), results=[];
  if(kind==='class') for(let offset=0;offset<10000;offset+=50) {
    const page=searchLibrary(database,{ruleset,kind:'class_feature',context:JSON.stringify(context),limit:50,offset});
    results.push(...page.results.filter(e=>e.eligibility?.status==='eligible').map(e=>({...e,ruleset})));
    if(offset+50>=page.total) break;
  }
  results.push(...additional.entries);
  return {ruleset,results,warnings:additional.warnings,sourceChoices:additional.sourceChoices || []};
}

export const LIBRARY_RULESETS = new Set(["dnd5e-2014", "dnd5r-2024"]);

function libraryRuleset(value) {
  const ruleset = String(value ?? "dnd5e-2014");
  if (!LIBRARY_RULESETS.has(ruleset)) throw new RangeError("未知的资料库规则版本。");
  return ruleset;
}

export function openLibrary(path) {
  if (!existsSync(path)) return null;
  return new DatabaseSync(path, { readOnly: true });
}

export function librarySummary(database, options = {}) {
  registerProvenance(database);
  const ruleset = libraryRuleset(options.ruleset);
  return {
    ruleset,
    sourceGroups: SOURCE_GROUPS,
    books: database.prepare(`SELECT json_extract(source_meta(source_book,payload_json,ruleset),'$.book') AS book,
      json_extract(source_meta(source_book,payload_json,ruleset),'$.group') AS sourceGroup,COUNT(*) AS count
      FROM library_entries WHERE ruleset=? GROUP BY book,sourceGroup ORDER BY book`).all(ruleset),
    sources: database.prepare("SELECT filename, ruleset, imported_at AS importedAt, distribution FROM library_sources WHERE ruleset = ? ORDER BY imported_at DESC").all(ruleset),
    kinds: database.prepare(`SELECT e.kind, COALESCE(t.domain, '未分类') AS domain,
      COALESCE(t.label, e.kind) AS label, COUNT(*) AS count
      FROM library_entries e LEFT JOIN library_taxonomy t ON t.kind=e.kind
      WHERE e.ruleset=? AND COALESCE(json_extract(e.payload_json, '$.规则关联.isMisclassified'),0)!=1 GROUP BY e.kind, t.domain, t.label
      ORDER BY CASE t.domain WHEN '人物选项' THEN 0 WHEN '法术' THEN 1
        WHEN '装备' THEN 2 WHEN '能力' THEN 3 WHEN '生物与据点' THEN 4 ELSE 5 END,
        e.kind`).all(ruleset),
    sheets: database.prepare("SELECT s.name, s.role, s.max_row AS maxRow, s.max_column AS maxColumn FROM library_sheets s JOIN library_sources l ON l.id = s.source_id WHERE l.ruleset = ? ORDER BY s.rowid").all(ruleset),
    totalCells: database.prepare("SELECT COUNT(*) AS count FROM library_cells c JOIN library_sources l ON l.id = c.source_id WHERE l.ruleset = ?").get(ruleset).count,
  };
}

export function searchLibrary(database, options = {}) {
  registerProvenance(database);
  const query = String(options.query ?? "").trim().slice(0, 120);
  const ruleset = libraryRuleset(options.ruleset);
  const kind = String(options.kind ?? "").trim();
  const domain = String(options.domain ?? "").trim().slice(0, 40);
  const subcategory = String(options.subcategory ?? "").trim().slice(0, 80);
  const rank = options.rank === undefined || options.rank === "" ? null : Number(options.rank);
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 50);
  const offset = Math.min(Math.max(Number(options.offset) || 0, 0), 10000);
  if(kind==='species_feature') {
    const data=featureImports(database,{...options,ruleset,kind:'species'});
    const matches=data.results.filter(e=>!query || e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return {...data,total:matches.length,results:matches.slice(offset,offset+limit).map(e=>({...e,
      eligibility:entryEligibility(e,JSON.parse(options.context||'{}')),provenance:classifySource(e.sourceBook,e.payload,ruleset)}))};
  }
  if (rank !== null && (!Number.isInteger(rank) || rank < 0 || rank > 9)) throw new RangeError("环阶必须为 0–9。");
  const filters = ["e.ruleset = ?"];
  const params = [ruleset];
  if(kind==='species' && options.speciesFor!==undefined) {
    const parent=database.prepare("SELECT payload_json FROM library_entries WHERE ruleset=? AND kind='species' AND name=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1").get(ruleset,String(options.speciesFor),String(options.speciesEntryId||''));
    filters.push("json_extract(e.payload_json,'$.族系')=? AND e.name!=json_extract(e.payload_json,'$.族系')");
    params.push(parent?JSON.parse(parent.payload_json).族系:'');
  }
  if(options.sourceGroup) {filters.push("json_extract(source_meta(e.source_book,e.payload_json,e.ruleset),'$.group')=?");params.push(String(options.sourceGroup));}
  if(options.book) {filters.push("json_extract(source_meta(e.source_book,e.payload_json,e.ruleset),'$.book')=?");params.push(String(options.book));}
  if (kind) { filters.push("e.kind = ?"); params.push(kind); }
  if (domain) { filters.push("t.domain = ?"); params.push(domain); }
  if (subcategory) { filters.push("c.subcategory = ?"); params.push(subcategory); }
  if (rank !== null) { filters.push("e.rank = ?"); params.push(rank); }
  if (query) {
    const bodySearch = !options.context && (!kind || kind === 'reference');
    filters.push("(instr(lower(e.name), lower(?)) > 0 OR instr(lower(coalesce(e.english_name, '')), lower(?)) > 0" + (bodySearch ? " OR (e.kind='reference' AND instr(lower(coalesce(json_extract(e.payload_json, '$.正文'),'')),lower(?))>0)" : '') + ')');
    params.push(query, query);
    if(bodySearch)params.push(query);
  }
  const where = filters.join(" AND ");
  const relevance = "CASE WHEN lower(e.name)=lower(?) THEN 0 WHEN instr(lower(e.name),lower(?))=1 THEN 1 ELSE 2 END";
  const from = `FROM library_entries e LEFT JOIN library_taxonomy t ON t.kind=e.kind
    LEFT JOIN library_entry_classifications c ON c.entry_id=e.id`;
  if (options.context) {
    const context = JSON.parse(String(options.context).slice(0, 12000));
    context.ruleset = ruleset;
    const candidates = database.prepare(`SELECT e.id, e.kind, e.name, e.english_name AS englishName, e.rank,
      e.source_book AS sourceBook, e.source_sheet AS sourceSheet, e.source_range AS sourceRange,
      e.payload_json AS payloadJson ${from} WHERE ${where} ORDER BY ${relevance},e.rank,e.name`).all(...params,query,query);
    const owned = characterClasses(context);
    const names = spellClassNames(context, options.castingClassId || context.classId);
    const filtered = candidates.map(({ payloadJson, ...entry }) => ({ ...entry, payload: JSON.parse(payloadJson) }))
      .filter((entry) => {
        const p = entry.payload, link = p.规则关联 || {};
        if (link.isMirror) return false;
        if (link.isMisclassified) return false;
        if (entry.kind === "spell" && names !== null && !(p.职业列表 || []).some((n) => names.includes(String(n).trim()))) return false;
        if (entry.kind === "class_feature") {
          const owner = owned.find((c) => c.classId === classIdForName(p.职业));
          if (!owner || (link.subclass && link.subclass !== owner.subclass)) return false;
        }
        if (entry.kind === "feat" && options.featureKind === "fighting" && p.分类 !== "战斗风格") return false;
        if (entry.kind === "feat" && options.featureKind === "feat" && p.分类 === "战斗风格") return false;
        return true;
      }).map((entry) => ({ ...entry, eligibility: entryEligibility(entry, context, options) }))
      .sort((a, b) => Number(a.eligibility.status === "blocked") - Number(b.eligibility.status === "blocked"));
    return { ruleset, total: filtered.length, results: filtered.slice(offset, offset + limit).map(e=>({...e,provenance:classifySource(e.sourceBook,e.payload,ruleset)})) };
  }
  filters.push("COALESCE(json_extract(e.payload_json, '$.规则关联.isMirror'), 0) != 1");
  filters.push("COALESCE(json_extract(e.payload_json, '$.规则关联.isMisclassified'), 0) != 1");
  const finalWhere = filters.join(" AND ");
  const total = database.prepare(`SELECT COUNT(*) AS count ${from} WHERE ${finalWhere}`).get(...params).count;
  const results = database.prepare(`SELECT e.id, e.kind, e.name, e.english_name AS englishName, e.rank,
      e.source_book AS sourceBook, e.source_sheet AS sourceSheet, e.source_range AS sourceRange,
      e.review_status AS reviewStatus, t.domain, t.label AS categoryLabel,
      c.subcategory, c.automation_level AS automationLevel
      ,source_meta(e.source_book,e.payload_json,e.ruleset) AS provenanceJson,
      json_extract(e.payload_json,'$.族系') AS speciesFamily
      ${from} WHERE ${finalWhere}
      ORDER BY ${relevance},CASE e.kind WHEN 'spell' THEN 0 WHEN 'class' THEN 1 WHEN 'background' THEN 2 WHEN 'weapon' THEN 3 ELSE 4 END,
               e.rank, e.name LIMIT ? OFFSET ?`).all(...params, query, query, limit, offset);
  return { ruleset, total, results:results.map(({provenanceJson,...e})=>({...e,provenance:JSON.parse(provenanceJson)})) };
}

export function classOptions(database, options = {}) {
  const ruleset = libraryRuleset(options.ruleset);
  return { ruleset, results: database.prepare("SELECT id,name,payload_json AS payloadJson FROM library_entries WHERE ruleset=? AND kind='class'").all(ruleset)
    .map(({ payloadJson, ...row }) => ({ ...row, classId: classIdForName(row.name), payload: JSON.parse(payloadJson) })).filter((row) => row.classId) };
}

export function getLibraryEntry(database, id, options = {}) {
  const ruleset = libraryRuleset(options.ruleset);
  if(id.includes(':feature:') && options.context) {
    const context={...JSON.parse(String(options.context).slice(0,12000)),ruleset};
    const entries=resolveAdditionalFeatures(database,context,'species').entries;
    return entries.find(e=>e.id===id) || null;
  }
  const row = database.prepare(`SELECT e.id, e.kind, e.name, e.english_name AS englishName,
    e.ruleset, e.rank, e.source_book AS sourceBook, e.source_sheet AS sourceSheet,
    e.source_range AS sourceRange, e.review_status AS reviewStatus,
    e.payload_json AS payloadJson, t.domain, t.label AS categoryLabel,
    t.warning AS categoryWarning, c.subcategory, c.automation_level AS automationLevel
    FROM library_entries e LEFT JOIN library_taxonomy t ON t.kind=e.kind
    LEFT JOIN library_entry_classifications c ON c.entry_id=e.id
    WHERE e.id = ? AND e.ruleset = ?`).get(id, ruleset);
  if (!row) return null;
  const { payloadJson, ...entry } = row;
  return { ...entry, payload: JSON.parse(payloadJson), provenance:classifySource(entry.sourceBook,payloadJson,ruleset) };
}
