import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getLibraryEntry, librarySummary, searchLibrary } from "../tools/library.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test('local workbook archive includes both editions, omitted 5E armor and automation metadata',()=>{
  const db=new DatabaseSync(path.join(root,'local-data/content-library.sqlite'),{readOnly:true});
  assert.equal(db.prepare("SELECT count(*) n FROM library_entries WHERE ruleset='dnd5e-2014' AND kind='armor'").get().n,12);
  assert.equal(db.prepare("SELECT count(*) n FROM library_workbook_metadata WHERE kind='defined_name'").get().n,244);
  assert.equal(db.prepare("SELECT count(*) n FROM library_workbook_metadata WHERE kind='validation'").get().n,314);
  assert.equal(db.prepare("SELECT count(*) n FROM library_workbook_metadata WHERE kind='comment'").get().n,79);
  for(const [ruleset,cells,spells] of [['dnd5e-2014',19175,522],['dnd5r-2024',36367,809]]) {
    assert.equal(librarySummary(db,{ruleset}).totalCells,cells);
    assert.equal(db.prepare("SELECT count(*) n FROM library_entries WHERE ruleset=? AND kind='spell' AND source_id NOT LIKE 'compendium-5e-%'").get(ruleset).n,spells);
    assert.ok(searchLibrary(db,{ruleset,kind:'spell'}).total>=spells);
  }
  db.close();
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(root, "schemas", "content-library.sql"), "utf8"));
  db.prepare("INSERT INTO library_sources VALUES (?, ?, ?, ?, ?, ?, ?)").run("source", "card.xlsm", "sha", "dnd5e-2014", "2026-10-26", "local_only", "test");
  db.prepare("INSERT INTO library_sources VALUES (?, ?, ?, ?, ?, ?, ?)").run("source-5r", "card.xlsx", "sha-5r", "dnd5r-2024", "2026-10-26", "local_only", "test");
  db.prepare("INSERT INTO library_sheets VALUES (?, ?, ?, ?, ?, ?)").run("source", "法术大全", "reference", "visible", 3, 25);
  const insert = db.prepare("INSERT INTO library_entries (id,source_id,ruleset,kind,name,english_name,rank,source_sheet,source_range,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)");
  insert.run("s1", "source", "dnd5e-2014", "spell", "酸液飞溅", "Acid Splash", 0, "法术大全", "A2:Y2", '{"学派":"咒法"}');
  insert.run("s2", "source", "dnd5e-2014", "spell", "火球术", "Fireball", 3, "法术大全", "A3:Y3", '{"学派":"塑能"}');
  insert.run("i1", "source", "dnd5e-2014", "item", "绳索", null, null, "图表", "AB18:AE18", '{"重量":10}');
  insert.run("r1", "source-5r", "dnd5r-2024", "spell", "火球术", "Fireball", 3, "法术大全", "A4:Z4", '{"学派":"塑能","专注":null}');
  db.prepare("INSERT INTO library_taxonomy VALUES (?,?,?,?,?)").run("spell", "法术", "法术", "lookup", "效果不自动执行");
  db.prepare("INSERT INTO library_taxonomy VALUES (?,?,?,?,?)").run("item", "装备", "普通物品", "lookup", "不是奇物");
  db.prepare("INSERT INTO library_entry_classifications VALUES (?,?,?,?)").run("s2", "塑能", "source_range_and_payload", "lookup");
  return db;
}

test("library search filters by name and spell rank without mixing rulesets", () => {
  const db = fixture();
  assert.equal(searchLibrary(db, { query: "acid" }).results[0].name, "酸液飞溅");
  assert.equal(searchLibrary(db, { kind: "spell", rank: "3" }).results[0].name, "火球术");
  assert.deepEqual(searchLibrary(db, { kind: "spell", ruleset: "dnd5e-2014", rank: "0" }).results.map((item) => item.name), ["酸液飞溅"]);
  assert.equal(searchLibrary(db, { kind: "spell", ruleset: "dnd5r-2024", rank: "0" }).total, 0);
  assert.equal(searchLibrary(db, { query: "' OR 1=1 --" }).total, 0);
  assert.equal(searchLibrary(db, { kind: "spell", ruleset: "dnd5e-2014" }).total, 2);
  assert.equal(searchLibrary(db, { kind: "spell", ruleset: "dnd5r-2024" }).total, 1);
  assert.equal(searchLibrary(db, { kind: "item", query: "绳" }).total, 1);
  assert.equal(searchLibrary(db, { kind: "curio", query: "绳" }).total, 0);
  assert.throws(() => searchLibrary(db, { rank: "11" }), RangeError);
  db.close();
});

test("library returns provenance and payload without changing character data", () => {
  const db = fixture();
  const entry = getLibraryEntry(db, "s1");
  assert.equal(entry.sourceRange, "A2:Y2");
  assert.equal(entry.payload.学派, "咒法");
  assert.equal(entry.reviewStatus, "imported_unverified");
  assert.equal(librarySummary(db).totalCells, 0);
  assert.equal(librarySummary(db, { ruleset: "dnd5r-2024" }).sources[0].filename, "card.xlsx");
  assert.equal(getLibraryEntry(db, "r1"), null);
  assert.equal(getLibraryEntry(db, "r1", { ruleset: "dnd5r-2024" }).ruleset, "dnd5r-2024");
  db.close();
});

test("taxonomy preserves ordinary gear, spell school and ruleset separation", () => {
  const db = fixture();
  assert.equal(searchLibrary(db, { domain: "装备" }).total, 1);
  assert.equal(searchLibrary(db, { kind: "spell", subcategory: "塑能" }).total, 1);
  assert.equal(searchLibrary(db, { kind: "spell", subcategory: "塑能", ruleset: "dnd5r-2024" }).total, 0);
  assert.equal(getLibraryEntry(db, "s2").categoryWarning, "效果不自动执行");
  assert.equal(librarySummary(db).kinds.find(({ kind }) => kind === "item").domain, "装备");
  db.close();
});
