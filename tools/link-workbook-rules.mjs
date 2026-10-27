// Derive links from the imported source formulas, never from cached character values.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { classIdForName } from "../prototype/character-rules.mjs";

const database = new DatabaseSync(fileURLToPath(new URL("../local-data/content-library.sqlite", import.meta.url)));
const sources = database.prepare("SELECT id,ruleset FROM library_sources").all();
const source = sources.find((s) => s.ruleset === "dnd5r-2024");
const cells = new Map(database.prepare("SELECT address,value_json,formula FROM library_cells WHERE source_id=? AND sheet_name='职业'").all(source.id).map((c) => [c.address, c]));
const value = (address) => JSON.parse(cells.get(address)?.value_json || "null");
const formula = (address) => {
  const raw = cells.get(address)?.formula || "";
  return raw.startsWith("{") ? JSON.parse(raw).text : raw;
};
function boundaries(expression) {
  return [...expression.matchAll(/\$AZ\$(\d+)(>=|=)(\d+),(\d+)/g)].map((m) => ({ ownerRow: Number(m[1]), op: m[2], level: Number(m[3]), end: Number(m[4]) + 33 }));
}
function availableLevel(scope, row) {
  for (let level = 1; level <= 20; level++) {
    const end = scope.bounds.find((b) => b.op === ">=" ? level >= b.level : level === b.level)?.end || 0;
    if (row >= scope.start && row <= end) return level;
  }
  return null;
}
const scopes = [];
for (let row = 2; row <= 22; row++) {
  const className = value(`CH${row}`), bounds = boundaries(formula(`CM${row}`));
  if (typeof className === "string" && bounds.length) scopes.push({ className, ownerRow: row, subclass: "", start: 40, bounds, source: `职业!CH${row}:CM${row}` });
}
for (let row = 30; row <= 285; row++) {
  const subclass = value(`CH${row}`), start = value(`CI${row}`), bounds = boundaries(formula(`CJ${row}`));
  if (typeof subclass !== "string" || !Number.isInteger(start) || !bounds.length) continue;
  const ownerRow = bounds[0].ownerRow, className = value(`CH${ownerRow}`);
  if (className) scopes.push({ className, ownerRow, subclass, start: start + 33, bounds, source: `职业!CH${row}:CJ${row}` });
}
const starter5e = new Set(["神圣感知", "圣疗", "法师施法", "奥术回想", "狂暴", "无甲防御", "德鲁伊语", "德鲁伊施法", "吟游诗人施法", "诗人激励", "吟游诗人激励", "牧师施法", "神圣领域", "战士战斗风格", "回气", "战斗风格", "武艺", "专精", "偷袭", "盗贼黑话", "术士施法", "术法起源", "异界宗主", "契约魔法", "宿敌", "自然探索者", "魔法工艺", "奇械师施法"]);
const counts = { classFeaturesLinked: 0, featsMirrorsExcluded: 0, unknownFeatureLevels: 0 };
database.exec("BEGIN");
try {
  const update = database.prepare("UPDATE library_entries SET payload_json=? WHERE id=?");
  for (const entry of database.prepare("SELECT * FROM library_entries WHERE kind IN ('class','class_feature','feat')").all()) {
    const p = JSON.parse(entry.payload_json), link = {};
    if (entry.kind === "class_feature") {
      link.className = p.职业;
      if (entry.ruleset === "dnd5r-2024") {
        const row = Number(entry.source_range.match(/\d+/)?.[0]);
        const scope = scopes.find((s) => s.className === p.职业 && availableLevel(s, row));
        if (scope) { link.subclass = scope.subclass; link.minLevel = availableLevel(scope, row); link.source = scope.source; }
      } else {
        const start = String(p.描述 || "").trim().slice(0, 160);
        const match = start.match(/^(?:从|当你达到|当你到达|在你达到|到达)?\s*第?\s*(\d+)\s*级/);
        link.minLevel = match ? Number(match[1]) : starter5e.has(entry.name) ? 1 : null;
        link.source = `${entry.source_sheet}!${entry.source_range}`;
      }
      if (link.minLevel) counts.classFeaturesLinked++; else counts.unknownFeatureLevels++;
    }
    if (entry.kind === "class") {
      link.classId = classIdForName(entry.name);
      if (entry.ruleset === "dnd5r-2024") link.subclasses = scopes.filter((s) => s.className === entry.name && s.subclass).map((s) => ({ name: s.subclass, minLevel: Math.min(...s.bounds.map((b) => b.level)), source: s.source }));
    }
    if (entry.kind === "feat" && entry.ruleset === "dnd5r-2024" && /^[FH]\d+:/.test(entry.source_range)) {
      link.isMirror = true;
      counts.featsMirrorsExcluded++;
    }
    p.规则关联 = link;
    update.run(JSON.stringify(p), entry.id);
  }
  database.exec("COMMIT");
} catch (error) { database.exec("ROLLBACK"); throw error; }
database.close();
console.log(JSON.stringify({ ...counts, scopes: scopes.length }));
