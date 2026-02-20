-- Lupita Dashboard — Schema SQLite

CREATE TABLE IF NOT EXISTS daily_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  num_tickets INTEGER NOT NULL DEFAULT 0,
  avg_ticket REAL NOT NULL DEFAULT 0,
  num_customers INTEGER NOT NULL DEFAULT 0,
  avg_per_customer REAL NOT NULL DEFAULT 0,
  qty_items REAL NOT NULL DEFAULT 0,
  qty_per_ticket REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  total_vat REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  target_gross REAL NOT NULL DEFAULT 0,
  is_closed BOOLEAN NOT NULL DEFAULT 0,
  UNIQUE(store_id, date)
);

CREATE TABLE IF NOT EXISTS stores (
  store_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  open_days TEXT NOT NULL,
  opened_date TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  date_from TEXT,
  date_to TEXT,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  errors TEXT,
  import_type TEXT DEFAULT 'financial'
);

CREATE TABLE IF NOT EXISTS zone_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  zone TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  total_net REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  UNIQUE(store_id, date, zone)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_store ON daily_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_daily_sales_store_date ON daily_sales(store_id, date);
CREATE INDEX IF NOT EXISTS idx_zone_sales_date ON zone_sales(date);
CREATE INDEX IF NOT EXISTS idx_zone_sales_store ON zone_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_zone_sales_store_date ON zone_sales(store_id, date);
CREATE INDEX IF NOT EXISTS idx_zone_sales_zone ON zone_sales(zone);

-- Article sales (aggregated per report period, not daily)
CREATE TABLE IF NOT EXISTS article_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  article_code TEXT NOT NULL,
  article_name TEXT NOT NULL,
  barcode TEXT,
  family TEXT,
  subfamily TEXT,
  qty_sold REAL NOT NULL DEFAULT 0,
  revenue_net REAL NOT NULL DEFAULT 0,
  revenue_gross REAL NOT NULL DEFAULT 0,
  UNIQUE(store_id, date_from, date_to, article_code)
);

CREATE INDEX IF NOT EXISTS idx_article_sales_store ON article_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_article_sales_dates ON article_sales(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_article_sales_family ON article_sales(family);

-- ABC Analysis (daily granularity per article per store)
CREATE TABLE IF NOT EXISTS abc_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  article_code TEXT NOT NULL,
  article_name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL DEFAULT 0,
  qty_pct REAL NOT NULL DEFAULT 0,
  value_net REAL NOT NULL DEFAULT 0,
  value_gross REAL NOT NULL DEFAULT 0,
  value_pct REAL NOT NULL DEFAULT 0,
  value_cumulative REAL NOT NULL DEFAULT 0,
  cumulative_pct REAL NOT NULL DEFAULT 0,
  ranking INTEGER NOT NULL DEFAULT 0,
  abc_class TEXT,
  is_excluded BOOLEAN NOT NULL DEFAULT 0,
  exclude_reason TEXT,
  UNIQUE(store_id, date, article_code)
);
CREATE INDEX IF NOT EXISTS idx_abc_store_date ON abc_daily(store_id, date);
CREATE INDEX IF NOT EXISTS idx_abc_article ON abc_daily(article_code);
CREATE INDEX IF NOT EXISTS idx_abc_class ON abc_daily(abc_class);
CREATE INDEX IF NOT EXISTS idx_abc_excluded ON abc_daily(is_excluded);
