PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS library_sources (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  ruleset TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  distribution TEXT NOT NULL DEFAULT 'local_only',
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_sheets (
  source_id TEXT NOT NULL REFERENCES library_sources(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  visibility TEXT NOT NULL,
  max_row INTEGER NOT NULL,
  max_column INTEGER NOT NULL,
  PRIMARY KEY (source_id, name)
);

CREATE TABLE IF NOT EXISTS library_cells (
  source_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  address TEXT NOT NULL,
  value_json TEXT,
  formula TEXT,
  PRIMARY KEY (source_id, sheet_name, address),
  FOREIGN KEY (source_id, sheet_name) REFERENCES library_sheets(source_id, name)
);

CREATE TABLE IF NOT EXISTS library_entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES library_sources(id),
  ruleset TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  english_name TEXT,
  rank INTEGER,
  source_book TEXT,
  source_sheet TEXT NOT NULL,
  source_range TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'imported_unverified',
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS library_entries_lookup ON library_entries(ruleset, kind, rank, name);
CREATE INDEX IF NOT EXISTS library_entries_source ON library_entries(source_id, source_sheet);

CREATE TABLE IF NOT EXISTS library_taxonomy (
  kind TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  capability TEXT NOT NULL,
  warning TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS library_entry_classifications (
  entry_id TEXT PRIMARY KEY REFERENCES library_entries(id) ON DELETE CASCADE,
  subcategory TEXT NOT NULL DEFAULT '',
  classification_method TEXT NOT NULL,
  automation_level TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS library_classifications_subcategory ON library_entry_classifications(subcategory);
