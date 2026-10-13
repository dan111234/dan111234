-- docs/07 §5. Timestamps are Unix ms.
CREATE TABLE buy_costs (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', condition TEXT NOT NULL DEFAULT 'new',
  fba_cost REAL, fbm_cost REAL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (asin, mp, condition));
CREATE INDEX idx_buy_costs_updated ON buy_costs(updated_at DESC);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us',
  text TEXT, quantity INTEGER, url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX idx_notes_asin ON notes(asin, mp);

CREATE TABLE lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE list_items (
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE, asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us',
  title TEXT, image TEXT, snapshot_json TEXT, added_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, asin, mp));

CREATE TABLE history (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', title TEXT, image TEXT, brand TEXT,
  restriction TEXT, viewed_at INTEGER NOT NULL, PRIMARY KEY (asin, mp));
CREATE INDEX idx_history_viewed ON history(viewed_at DESC);

CREATE TABLE asin_restrictions (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', condition TEXT NOT NULL, brand TEXT,
  title TEXT, image TEXT, status TEXT NOT NULL, checked_at INTEGER NOT NULL,
  PRIMARY KEY (asin, mp, condition));
CREATE INDEX idx_restr_brand ON asin_restrictions(brand, mp);

CREATE TABLE ip_brands (brand TEXT PRIMARY KEY, reason TEXT, added_at INTEGER NOT NULL);
CREATE TABLE melt_keywords (keyword TEXT PRIMARY KEY);
CREATE TABLE finder_searches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, selection_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
