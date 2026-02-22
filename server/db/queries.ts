import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { format as fmtDate } from 'date-fns';
import { syncPageUpdates } from './pageUpdates';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH || './lupita.db';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(__dirname, '../../', DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);

  // Migrations for existing databases
  // Add import_type column to import_log if missing
  const importLogCols = database.prepare("PRAGMA table_info(import_log)").all() as any[];
  if (!importLogCols.find((c: any) => c.name === 'import_type')) {
    database.exec("ALTER TABLE import_log ADD COLUMN import_type TEXT DEFAULT 'financial'");
  }

  // Add is_excluded column to abc_daily if missing (future-proof)
  const abcCols = database.prepare("PRAGMA table_info(abc_daily)").all() as any[];
  if (abcCols.length > 0 && !abcCols.find((c: any) => c.name === 'is_excluded')) {
    database.exec("ALTER TABLE abc_daily ADD COLUMN is_excluded BOOLEAN NOT NULL DEFAULT 0");
    database.exec("ALTER TABLE abc_daily ADD COLUMN exclude_reason TEXT");
  }

  // Composite index for ABC channel filtering (article_sales lookup by article_code + store_id + family)
  database.exec("CREATE INDEX IF NOT EXISTS idx_article_sales_code_store_family ON article_sales(article_code, store_id, family)");

  // Add insights_history table if missing
  const insightsTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='insights_history'"
  ).get();
  if (!insightsTbl) {
    database.exec(`
      CREATE TABLE insights_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        store_id TEXT,
        channel TEXT DEFAULT 'all',
        insights TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        data_snapshot TEXT
      );
      CREATE INDEX idx_insights_history_date ON insights_history(generated_at);
    `);
  }

  // Add hourly_sales table if missing
  const hourlyTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='hourly_sales'"
  ).get();
  if (!hourlyTbl) {
    database.exec(`
      CREATE TABLE hourly_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id TEXT NOT NULL,
        date TEXT NOT NULL,
        zone TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        num_tickets INTEGER NOT NULL DEFAULT 0,
        num_customers INTEGER NOT NULL DEFAULT 0,
        avg_ticket REAL NOT NULL DEFAULT 0,
        avg_per_customer REAL NOT NULL DEFAULT 0,
        total_net REAL NOT NULL DEFAULT 0,
        total_gross REAL NOT NULL DEFAULT 0,
        UNIQUE(store_id, date, zone, time_slot)
      );
      CREATE INDEX idx_hourly_store_date ON hourly_sales(store_id, date);
      CREATE INDEX idx_hourly_date_slot ON hourly_sales(date, time_slot);
    `);
  }

  // Add page_updates table if missing
  const pageUpdatesTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='page_updates'"
  ).get();
  if (!pageUpdatesTbl) {
    database.exec(`
      CREATE TABLE page_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_path TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        description TEXT
      );
    `);
  }

  // Add user_page_views table if missing
  const userPageViewsTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_page_views'"
  ).get();
  if (!userPageViewsTbl) {
    database.exec(`
      CREATE TABLE user_page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        page_path TEXT NOT NULL,
        viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, page_path),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX idx_user_page_views_user ON user_page_views(user_id);
    `);
  }

  // Add sync_settings table if missing
  const syncSettingsTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_settings'"
  ).get();
  if (!syncSettingsTbl) {
    database.exec(`
      CREATE TABLE sync_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        zsbms_username TEXT,
        zsbms_password_encrypted TEXT,
        auto_sync_enabled BOOLEAN NOT NULL DEFAULT 0,
        cron_expression TEXT NOT NULL DEFAULT '0 7 * * 1',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // Add sync_log table if missing
  const syncLogTbl = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_log'"
  ).get();
  if (!syncLogTbl) {
    database.exec(`
      CREATE TABLE sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL DEFAULT 'running',
        trigger_type TEXT NOT NULL DEFAULT 'manual',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        reports_succeeded INTEGER DEFAULT 0,
        reports_failed INTEGER DEFAULT 0,
        total_inserted INTEGER DEFAULT 0,
        total_updated INTEGER DEFAULT 0,
        details TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at);
    `);
  }

  // Sync page updates config to database
  syncPageUpdates();
}

/**
 * Gets the last date with actual sales data (total_gross > 0).
 * This prevents using "today" when today's data hasn't been imported yet,
 * which would cause negative deltas (targets counted but no revenue).
 */
export function getLastSalesDate(storeId?: string): string {
  const database = getDb();
  const storeFilter = storeId ? ' AND store_id = ?' : '';
  const args = storeId ? [storeId] : [];
  const row = database.prepare(`
    SELECT MAX(date) as last_date
    FROM daily_sales
    WHERE total_gross > 0${storeFilter}
  `).get(...args) as any;
  return row?.last_date || fmtDate(new Date(), 'yyyy-MM-dd');
}

// Upsert daily sales (idempotent)
export function upsertDailySale(data: {
  store_id: string;
  date: string;
  day_of_week: string;
  num_tickets: number;
  avg_ticket: number;
  num_customers: number;
  avg_per_customer: number;
  qty_items: number;
  qty_per_ticket: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  target_gross: number;
  is_closed: boolean;
}): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM daily_sales WHERE store_id = ? AND date = ?').get(data.store_id, data.date);

  if (existing) {
    database.prepare(`
      UPDATE daily_sales SET
        day_of_week = ?, num_tickets = ?, avg_ticket = ?, num_customers = ?,
        avg_per_customer = ?, qty_items = ?, qty_per_ticket = ?,
        total_net = ?, total_vat = ?, total_gross = ?, target_gross = ?, is_closed = ?
      WHERE store_id = ? AND date = ?
    `).run(
      data.day_of_week, data.num_tickets, data.avg_ticket, data.num_customers,
      data.avg_per_customer, data.qty_items, data.qty_per_ticket,
      data.total_net, data.total_vat, data.total_gross, data.target_gross, data.is_closed ? 1 : 0,
      data.store_id, data.date
    );
    return 'updated';
  } else {
    database.prepare(`
      INSERT INTO daily_sales (store_id, date, day_of_week, num_tickets, avg_ticket, num_customers,
        avg_per_customer, qty_items, qty_per_ticket, total_net, total_vat, total_gross, target_gross, is_closed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.store_id, data.date, data.day_of_week, data.num_tickets, data.avg_ticket, data.num_customers,
      data.avg_per_customer, data.qty_items, data.qty_per_ticket,
      data.total_net, data.total_vat, data.total_gross, data.target_gross, data.is_closed ? 1 : 0
    );
    return 'inserted';
  }
}

// Log import
export function logImport(data: {
  filename: string;
  date_from: string | null;
  date_to: string | null;
  records_inserted: number;
  records_updated: number;
  errors: string[] | null;
  import_type?: string;
}): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO import_log (filename, date_from, date_to, records_inserted, records_updated, errors, import_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.filename, data.date_from, data.date_to, data.records_inserted, data.records_updated,
    data.errors ? JSON.stringify(data.errors) : null, data.import_type || 'financial');
}

// Get import history
export function getImportHistory(limit: number = 50) {
  return getDb().prepare('SELECT * FROM import_log ORDER BY imported_at DESC LIMIT ?').all(limit);
}

// Get user by username
export function getUserByUsername(username: string) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
}

// Query daily sales with filters
export function getDailySales(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  let query = 'SELECT * FROM daily_sales WHERE date >= ? AND date <= ?';
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  query += ' ORDER BY date ASC, store_id ASC';
  return database.prepare(query).all(...args);
}

// Get aggregated KPIs for a period (with optional channel filter)
export function getKPIs(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    // Revenue from article_sales (channel-filtered), other metrics from daily_sales
    let revenueQuery = `
      SELECT COALESCE(SUM(revenue_gross), 0) as total_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      revenueQuery += ' AND store_id = ?';
      revenueArgs.push(params.storeId);
    }
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    const revenueRow = database.prepare(revenueQuery).get(...revenueArgs) as any;

    let dsQuery = `
      SELECT
        COALESCE(SUM(num_tickets), 0) as total_tickets,
        COALESCE(SUM(num_customers), 0) as total_customers,
        COALESCE(SUM(total_net), 0) as total_net,
        COALESCE(SUM(total_vat), 0) as total_vat,
        COALESCE(SUM(target_gross), 0) as total_target,
        COALESCE(SUM(qty_items), 0) as total_items,
        COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
      FROM daily_sales
      WHERE date >= ? AND date <= ?
    `;
    const dsArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      dsQuery += ' AND store_id = ?';
      dsArgs.push(params.storeId);
    }
    const dsRow = database.prepare(dsQuery).get(...dsArgs) as any;

    return {
      total_revenue: revenueRow.total_revenue,
      total_tickets: dsRow.total_tickets,
      total_customers: dsRow.total_customers,
      total_net: dsRow.total_net,
      total_vat: dsRow.total_vat,
      total_target: dsRow.total_target,
      total_items: dsRow.total_items,
      open_days: dsRow.open_days,
    };
  }

  // Default: all channels from daily_sales
  let query = `
    SELECT
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(num_tickets), 0) as total_tickets,
      COALESCE(SUM(num_customers), 0) as total_customers,
      COALESCE(SUM(total_net), 0) as total_net,
      COALESCE(SUM(total_vat), 0) as total_vat,
      COALESCE(SUM(target_gross), 0) as total_target,
      COALESCE(SUM(qty_items), 0) as total_items,
      COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
    FROM daily_sales
    WHERE date >= ? AND date <= ?
  `;
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  return database.prepare(query).get(...args) as any;
}

// Get KPIs grouped by store (with optional channel filter)
export function getKPIsByStore(params: {
  dateFrom: string;
  dateTo: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    // Revenue from article_sales, rest from daily_sales, joined by store
    let revenueQuery = `
      SELECT store_id, COALESCE(SUM(revenue_gross), 0) as total_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    revenueQuery += ' GROUP BY store_id';
    const revenueRows = database.prepare(revenueQuery).all(...revenueArgs) as any[];
    const revenueMap = new Map(revenueRows.map((r: any) => [r.store_id, r.total_revenue]));

    const dsRows = database.prepare(`
      SELECT
        store_id,
        COALESCE(SUM(num_tickets), 0) as total_tickets,
        COALESCE(SUM(num_customers), 0) as total_customers,
        COALESCE(SUM(target_gross), 0) as total_target,
        COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
      FROM daily_sales
      WHERE date >= ? AND date <= ?
      GROUP BY store_id
    `).all(params.dateFrom, params.dateTo) as any[];

    return dsRows.map((ds: any) => ({
      store_id: ds.store_id,
      total_revenue: revenueMap.get(ds.store_id) || 0,
      total_tickets: ds.total_tickets,
      total_customers: ds.total_customers,
      total_target: ds.total_target,
      open_days: ds.open_days,
    }));
  }

  return database.prepare(`
    SELECT
      store_id,
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(num_tickets), 0) as total_tickets,
      COALESCE(SUM(num_customers), 0) as total_customers,
      COALESCE(SUM(target_gross), 0) as total_target,
      COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
    FROM daily_sales
    WHERE date >= ? AND date <= ?
    GROUP BY store_id
  `).all(params.dateFrom, params.dateTo);
}

// Get weekly aggregated data for charts (with optional channel filter)
export function getWeeklyData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    // Revenue from article_sales by week, joined with daily_sales for tickets/customers/target
    let revenueQuery = `
      SELECT
        strftime('%Y-W%W', date_from) as week,
        store_id,
        COALESCE(SUM(revenue_gross), 0) as total_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      revenueQuery += ' AND store_id = ?';
      revenueArgs.push(params.storeId);
    }
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    revenueQuery += ' GROUP BY week, store_id';
    const revenueRows = database.prepare(revenueQuery).all(...revenueArgs) as any[];
    const revenueMap = new Map(revenueRows.map((r: any) => [`${r.week}|${r.store_id}`, r.total_revenue]));

    let dsQuery = `
      SELECT
        strftime('%Y-W%W', date) as week,
        MIN(date) as week_start,
        store_id,
        COALESCE(SUM(num_tickets), 0) as total_tickets,
        COALESCE(SUM(num_customers), 0) as total_customers,
        COALESCE(SUM(target_gross), 0) as total_target,
        COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
      FROM daily_sales
      WHERE date >= ? AND date <= ?
    `;
    const dsArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      dsQuery += ' AND store_id = ?';
      dsArgs.push(params.storeId);
    }
    dsQuery += ' GROUP BY week, store_id ORDER BY week ASC, store_id ASC';
    const dsRows = database.prepare(dsQuery).all(...dsArgs) as any[];

    return dsRows.map((ds: any) => ({
      ...ds,
      total_revenue: revenueMap.get(`${ds.week}|${ds.store_id}`) || 0,
    }));
  }

  // Default: all channels from daily_sales
  let query = `
    SELECT
      strftime('%Y-W%W', date) as week,
      MIN(date) as week_start,
      store_id,
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(num_tickets), 0) as total_tickets,
      COALESCE(SUM(num_customers), 0) as total_customers,
      COALESCE(SUM(target_gross), 0) as total_target,
      COUNT(CASE WHEN is_closed = 0 THEN 1 END) as open_days
    FROM daily_sales
    WHERE date >= ? AND date <= ?
  `;
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  query += ' GROUP BY week, store_id ORDER BY week ASC, store_id ASC';
  return database.prepare(query).all(...args);
}

// Get daily data grouped by day of week (with optional channel filter)
export function getDayOfWeekData(params: {
  dateFrom: string;
  dateTo: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    // Revenue per day from article_sales, then average by day_of_week
    let revenueQuery = `
      SELECT date_from as date, store_id, COALESCE(SUM(revenue_gross), 0) as day_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    revenueQuery += ' GROUP BY date_from, store_id';

    // Join with daily_sales for day_of_week name and is_closed flag
    const query = `
      SELECT
        ds.day_of_week,
        ds.store_id,
        AVG(CASE WHEN ds.is_closed = 0 THEN ar.day_revenue END) as avg_revenue,
        AVG(CASE WHEN ds.is_closed = 0 THEN ds.num_tickets END) as avg_tickets,
        COUNT(CASE WHEN ds.is_closed = 0 THEN 1 END) as days_open
      FROM daily_sales ds
      LEFT JOIN (${revenueQuery}) ar ON ar.date = ds.date AND ar.store_id = ds.store_id
      WHERE ds.date >= ? AND ds.date <= ?
      GROUP BY ds.day_of_week, ds.store_id
      ORDER BY
        CASE ds.day_of_week
          WHEN 'Segunda' THEN 1
          WHEN 'Terça' THEN 2
          WHEN 'Quarta' THEN 3
          WHEN 'Quinta' THEN 4
          WHEN 'Sexta' THEN 5
          WHEN 'Sábado' THEN 6
          WHEN 'Domingo' THEN 7
        END,
        ds.store_id
    `;
    return database.prepare(query).all(...revenueArgs, params.dateFrom, params.dateTo);
  }

  return database.prepare(`
    SELECT
      day_of_week,
      store_id,
      AVG(CASE WHEN is_closed = 0 THEN total_gross END) as avg_revenue,
      AVG(CASE WHEN is_closed = 0 THEN num_tickets END) as avg_tickets,
      COUNT(CASE WHEN is_closed = 0 THEN 1 END) as days_open
    FROM daily_sales
    WHERE date >= ? AND date <= ?
    GROUP BY day_of_week, store_id
    ORDER BY
      CASE day_of_week
        WHEN 'Segunda' THEN 1
        WHEN 'Terça' THEN 2
        WHEN 'Quarta' THEN 3
        WHEN 'Quinta' THEN 4
        WHEN 'Sexta' THEN 5
        WHEN 'Sábado' THEN 6
        WHEN 'Domingo' THEN 7
      END,
      store_id
  `).all(params.dateFrom, params.dateTo);
}

// Get monthly data for comparison charts (with optional channel filter)
export function getMonthlyData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    let revenueQuery = `
      SELECT
        strftime('%Y-%m', date_from) as month,
        store_id,
        COALESCE(SUM(revenue_gross), 0) as total_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      revenueQuery += ' AND store_id = ?';
      revenueArgs.push(params.storeId);
    }
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    revenueQuery += ' GROUP BY month, store_id';
    const revenueRows = database.prepare(revenueQuery).all(...revenueArgs) as any[];
    const revenueMap = new Map(revenueRows.map((r: any) => [`${r.month}|${r.store_id}`, r.total_revenue]));

    let dsQuery = `
      SELECT
        strftime('%Y-%m', date) as month,
        store_id,
        COALESCE(SUM(num_tickets), 0) as total_tickets,
        COALESCE(SUM(num_customers), 0) as total_customers,
        COALESCE(SUM(target_gross), 0) as total_target
      FROM daily_sales
      WHERE date >= ? AND date <= ?
    `;
    const dsArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      dsQuery += ' AND store_id = ?';
      dsArgs.push(params.storeId);
    }
    dsQuery += ' GROUP BY month, store_id ORDER BY month ASC';
    const dsRows = database.prepare(dsQuery).all(...dsArgs) as any[];

    return dsRows.map((ds: any) => ({
      ...ds,
      total_revenue: revenueMap.get(`${ds.month}|${ds.store_id}`) || 0,
    }));
  }

  let query = `
    SELECT
      strftime('%Y-%m', date) as month,
      store_id,
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(num_tickets), 0) as total_tickets,
      COALESCE(SUM(num_customers), 0) as total_customers,
      COALESCE(SUM(target_gross), 0) as total_target
    FROM daily_sales
    WHERE date >= ? AND date <= ?
  `;
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  query += ' GROUP BY month, store_id ORDER BY month ASC';
  return database.prepare(query).all(...args);
}

// Get heatmap data (daily, optionally filtered by store and channel)
export function getHeatmapData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';

  if (channel !== 'all') {
    // Revenue from article_sales per day, joined with daily_sales for day_of_week
    let revenueQuery = `
      SELECT date_from as date, COALESCE(SUM(revenue_gross), 0) as total_revenue
      FROM article_sales
      WHERE date_from >= ? AND date_to <= ?
    `;
    const revenueArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      revenueQuery += ' AND store_id = ?';
      revenueArgs.push(params.storeId);
    }
    revenueQuery = addChannelFilter(revenueQuery, revenueArgs, channel);
    revenueQuery += ' GROUP BY date_from';
    const revenueRows = database.prepare(revenueQuery).all(...revenueArgs) as any[];
    const revenueMap = new Map(revenueRows.map((r: any) => [r.date, r.total_revenue]));

    let dsQuery = `
      SELECT date, day_of_week
      FROM daily_sales
      WHERE date >= ? AND date <= ?
    `;
    const dsArgs: any[] = [params.dateFrom, params.dateTo];
    if (params.storeId) {
      dsQuery += ' AND store_id = ?';
      dsArgs.push(params.storeId);
    }
    dsQuery += ' GROUP BY date ORDER BY date ASC';
    const dsRows = database.prepare(dsQuery).all(...dsArgs) as any[];

    return dsRows.map((ds: any) => ({
      date: ds.date,
      day_of_week: ds.day_of_week,
      total_revenue: revenueMap.get(ds.date) || 0,
    }));
  }

  let query = `
    SELECT
      date,
      day_of_week,
      COALESCE(SUM(total_gross), 0) as total_revenue
    FROM daily_sales
    WHERE date >= ? AND date <= ?
  `;
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  query += ' GROUP BY date ORDER BY date ASC';
  return database.prepare(query).all(...args);
}

// ─── Zone Sales ───

// Upsert zone sale (idempotent)
export function upsertZoneSale(data: {
  store_id: string;
  date: string;
  day_of_week: string;
  zone: string;
  total_net: number;
  total_gross: number;
}): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database
    .prepare('SELECT id FROM zone_sales WHERE store_id = ? AND date = ? AND zone = ?')
    .get(data.store_id, data.date, data.zone);

  if (existing) {
    database
      .prepare(
        `UPDATE zone_sales SET day_of_week = ?, total_net = ?, total_gross = ?
         WHERE store_id = ? AND date = ? AND zone = ?`
      )
      .run(
        data.day_of_week,
        data.total_net,
        data.total_gross,
        data.store_id,
        data.date,
        data.zone
      );
    return 'updated';
  } else {
    database
      .prepare(
        `INSERT INTO zone_sales (store_id, date, day_of_week, zone, total_net, total_gross)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.store_id,
        data.date,
        data.day_of_week,
        data.zone,
        data.total_net,
        data.total_gross
      );
    return 'inserted';
  }
}

// Zone mix: aggregate revenue by zone (+ per-store breakdown when no storeId filter)
export function getZoneMix(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  // Totals per zone
  let zoneQuery = `
    SELECT
      zone,
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(total_net), 0) as total_net
    FROM zone_sales
    WHERE date >= ? AND date <= ?
  `;
  if (params.storeId) {
    zoneQuery += ' AND store_id = ?';
    args.push(params.storeId);
  }
  zoneQuery += ' GROUP BY zone ORDER BY total_revenue DESC';
  const zones = database.prepare(zoneQuery).all(...args) as any[];

  // Per-store breakdown (only when viewing all stores)
  let storeBreakdown: any[] = [];
  if (!params.storeId) {
    const storeArgs: any[] = [params.dateFrom, params.dateTo];
    const storeQuery = `
      SELECT
        zone,
        store_id,
        COALESCE(SUM(total_gross), 0) as total_revenue,
        COALESCE(SUM(total_net), 0) as total_net
      FROM zone_sales
      WHERE date >= ? AND date <= ?
      GROUP BY zone, store_id
      ORDER BY zone ASC, total_revenue DESC
    `;
    storeBreakdown = database.prepare(storeQuery).all(...storeArgs) as any[];
  }

  return { zones, storeBreakdown };
}

// Zone weekly trend: for stacked area chart
export function getZoneWeeklyTrend(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  let query = `
    SELECT
      strftime('%Y-W%W', date) as week,
      MIN(date) as week_start,
      zone,
      COALESCE(SUM(total_gross), 0) as total_revenue
    FROM zone_sales
    WHERE date >= ? AND date <= ?
  `;
  const args: any[] = [params.dateFrom, params.dateTo];

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }

  query += ' GROUP BY week, zone ORDER BY week ASC, zone ASC';
  return database.prepare(query).all(...args);
}

// ─── Article Sales ───

// Upsert article sale (idempotent)
export function upsertArticleSale(data: {
  store_id: string;
  date_from: string;
  date_to: string;
  article_code: string;
  article_name: string;
  barcode: string;
  family: string;
  subfamily: string;
  qty_sold: number;
  revenue_net: number;
  revenue_gross: number;
}): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database
    .prepare('SELECT id FROM article_sales WHERE store_id = ? AND date_from = ? AND date_to = ? AND article_code = ?')
    .get(data.store_id, data.date_from, data.date_to, data.article_code);

  if (existing) {
    database
      .prepare(
        `UPDATE article_sales SET
          article_name = ?, barcode = ?, family = ?, subfamily = ?,
          qty_sold = ?, revenue_net = ?, revenue_gross = ?
         WHERE store_id = ? AND date_from = ? AND date_to = ? AND article_code = ?`
      )
      .run(
        data.article_name, data.barcode, data.family, data.subfamily,
        data.qty_sold, data.revenue_net, data.revenue_gross,
        data.store_id, data.date_from, data.date_to, data.article_code
      );
    return 'updated';
  } else {
    database
      .prepare(
        `INSERT INTO article_sales (store_id, date_from, date_to, article_code, article_name, barcode, family, subfamily, qty_sold, revenue_net, revenue_gross)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.store_id, data.date_from, data.date_to, data.article_code,
        data.article_name, data.barcode, data.family, data.subfamily,
        data.qty_sold, data.revenue_net, data.revenue_gross
      );
    return 'inserted';
  }
}

// Delivery family names used for channel filtering
const DELIVERY_FAMILIES = ['DELIVERY', 'Hidden Delivery'];

function addChannelFilter(query: string, args: any[], channel: 'all' | 'loja' | 'delivery'): string {
  if (channel === 'loja') {
    const placeholders = DELIVERY_FAMILIES.map(() => '?').join(',');
    query += ` AND family NOT IN (${placeholders})`;
    args.push(...DELIVERY_FAMILIES);
  } else if (channel === 'delivery') {
    const placeholders = DELIVERY_FAMILIES.map(() => '?').join(',');
    query += ` AND family IN (${placeholders})`;
    args.push(...DELIVERY_FAMILIES);
  }
  return query;
}

// Top articles by revenue
export function getTopArticles(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  limit?: number;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const limit = params.limit || 15;
  const channel = params.channel || 'all';
  // Overlap: article period intersects filter range
  const args: any[] = [params.dateTo, params.dateFrom];

  // Always unify by article_name (merge same name even within a channel)
  const nameExpr = articleNameExpr();
  let query = `
    SELECT
      GROUP_CONCAT(DISTINCT article_code) as article_code,
      ${nameExpr} as article_name,
      GROUP_CONCAT(DISTINCT family) as family,
      GROUP_CONCAT(DISTINCT subfamily) as subfamily,
      COALESCE(SUM(qty_sold), 0) as total_qty,
      COALESCE(SUM(revenue_net), 0) as total_net,
      COALESCE(SUM(revenue_gross), 0) as total_revenue
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query = addChannelFilter(query, args, channel);
  query += ` GROUP BY ${nameExpr} ORDER BY total_revenue DESC LIMIT ?`;
  args.push(limit);

  return database.prepare(query).all(...args);
}

// Family mix: aggregate revenue by family
export function getFamilyMix(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  // Overlap: article period intersects filter range
  const args: any[] = [params.dateTo, params.dateFrom];

  let query = `
    SELECT
      family,
      COALESCE(SUM(revenue_gross), 0) as total_revenue,
      COALESCE(SUM(qty_sold), 0) as total_qty,
      COUNT(DISTINCT article_code) as article_count
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query += ' GROUP BY family ORDER BY total_revenue DESC';

  return database.prepare(query).all(...args);
}

// Article trend: top articles compared across months
export function getArticleTrend(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  limit?: number;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const limit = params.limit || 5;
  const channel = params.channel || 'all';

  // Always unify by article_name
  const nameExpr = articleNameExpr();
  // First get top articles by name
  const topArgs: any[] = [params.dateTo, params.dateFrom];
  let topQuery = `
    SELECT ${nameExpr} as key_val
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  if (params.storeId) {
    topQuery += ' AND store_id = ?';
    topArgs.push(params.storeId);
  }
  topQuery = addChannelFilter(topQuery, topArgs, channel);
  topQuery += ` GROUP BY ${nameExpr} ORDER BY SUM(revenue_gross) DESC LIMIT ?`;
  topArgs.push(limit);

  const topArticles = database.prepare(topQuery).all(...topArgs) as any[];
  const topKeys = topArticles.map((a: any) => a.key_val);
  if (topKeys.length === 0) return [];

  // Then get monthly breakdown for those articles
  const placeholders = topKeys.map(() => '?').join(',');
  const trendArgs: any[] = [params.dateTo, params.dateFrom, ...topKeys];
  let trendQuery = `
    SELECT
      strftime('%Y-%m', date_from) as month,
      MIN(date_from) as date_from,
      MAX(date_to) as date_to,
      ${nameExpr} as article_code,
      ${nameExpr} as article_name,
      COALESCE(SUM(revenue_gross), 0) as total_revenue,
      COALESCE(SUM(qty_sold), 0) as total_qty
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
      AND ${nameExpr} IN (${placeholders})
  `;
  if (params.storeId) {
    trendQuery += ' AND store_id = ?';
    trendArgs.push(params.storeId);
  }
  trendQuery = addChannelFilter(trendQuery, trendArgs, channel);
  trendQuery += ` GROUP BY month, ${nameExpr} ORDER BY month ASC, total_revenue DESC`;

  return database.prepare(trendQuery).all(...trendArgs);
}

// Store comparison: top articles broken down by store
export function getArticlesByStore(params: {
  dateFrom: string;
  dateTo: string;
  limit?: number;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const limit = params.limit || 10;
  const channel = params.channel || 'all';

  // First get overall top articles
  const nameExpr = articleNameExpr();
  const topArgs: any[] = [params.dateTo, params.dateFrom];
  let topQuery = `
    SELECT ${nameExpr} as article_name
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  topQuery = addChannelFilter(topQuery, topArgs, channel);
  topQuery += ` GROUP BY ${nameExpr} ORDER BY SUM(revenue_gross) DESC LIMIT ?`;
  topArgs.push(limit);

  const topArticles = database.prepare(topQuery).all(...topArgs) as any[];
  const topNames = topArticles.map((a: any) => a.article_name);
  if (topNames.length === 0) return [];

  // Then get per-store breakdown for those articles
  const placeholders = topNames.map(() => '?').join(',');
  const args: any[] = [params.dateTo, params.dateFrom, ...topNames];
  let query = `
    SELECT
      store_id,
      ${nameExpr} as article_name,
      COALESCE(SUM(qty_sold), 0) as total_qty,
      COALESCE(SUM(revenue_net), 0) as total_net,
      COALESCE(SUM(revenue_gross), 0) as total_revenue
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
      AND ${nameExpr} IN (${placeholders})
  `;
  query = addChannelFilter(query, args, channel);
  query += ` GROUP BY store_id, ${nameExpr} ORDER BY ${nameExpr} ASC, store_id ASC`;

  return database.prepare(query).all(...args);
}

// Normalized category mix: uses family for loja, subfamily for delivery
export function getCategoryMix(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const channel = params.channel || 'all';
  const deliveryPlaceholders = DELIVERY_FAMILIES.map(() => '?').join(',');

  // Normalize: for delivery families use subfamily (cleaned), for loja use family
  // The CASE normalizes delivery subfamily names like "03 | Pizzas" → "Pizzas"
  const args: any[] = [
    ...DELIVERY_FAMILIES, // for CASE in SELECT
    params.dateTo, params.dateFrom, // for WHERE
  ];

  let query = `
    SELECT
      UPPER(
        CASE
          WHEN family IN (${deliveryPlaceholders})
          THEN TRIM(SUBSTR(subfamily, INSTR(subfamily, '|') + 1))
          ELSE family
        END
      ) as category,
      COALESCE(SUM(revenue_gross), 0) as total_revenue,
      COALESCE(SUM(qty_sold), 0) as total_qty,
      COUNT(DISTINCT article_name) as article_count
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query = addChannelFilter(query, args, channel);
  query += ` GROUP BY category
    HAVING category != '' AND category IS NOT NULL
    ORDER BY total_revenue DESC`;

  return database.prepare(query).all(...args);
}

// Channel split: delivery vs loja revenue totals
export function getChannelSplit(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  const whereArgs: any[] = [params.dateTo, params.dateFrom];

  let baseWhere = `date_from <= ? AND date_to >= ?`;
  if (params.storeId) {
    baseWhere += ` AND store_id = ?`;
    whereArgs.push(params.storeId);
  }

  const deliveryPlaceholders = DELIVERY_FAMILIES.map(() => '?').join(',');

  // CASE placeholders appear first in SQL, then WHERE placeholders
  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN family IN (${deliveryPlaceholders}) THEN revenue_gross ELSE 0 END), 0) as delivery_revenue,
      COALESCE(SUM(CASE WHEN family IN (${deliveryPlaceholders}) THEN qty_sold ELSE 0 END), 0) as delivery_qty,
      COALESCE(SUM(CASE WHEN family NOT IN (${deliveryPlaceholders}) THEN revenue_gross ELSE 0 END), 0) as loja_revenue,
      COALESCE(SUM(CASE WHEN family NOT IN (${deliveryPlaceholders}) THEN qty_sold ELSE 0 END), 0) as loja_qty,
      COALESCE(SUM(revenue_gross), 0) as total_revenue,
      COALESCE(SUM(qty_sold), 0) as total_qty
    FROM article_sales
    WHERE ${baseWhere}
  `;
  // Bind order: 4x DELIVERY_FAMILIES (for CASE expressions), then WHERE args
  const finalArgs = [
    ...DELIVERY_FAMILIES, ...DELIVERY_FAMILIES,
    ...DELIVERY_FAMILIES, ...DELIVERY_FAMILIES,
    ...whereArgs,
  ];

  return database.prepare(query).get(...finalArgs) as any;
}

// Get all stores
export function getStores() {
  return getDb().prepare('SELECT * FROM stores').all();
}

// Get date range of data
export function getDateRange() {
  return getDb().prepare('SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_sales').get() as any;
}

// ─── Projection ───

const DOW_MAP: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
  4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
};

export function getProjectionData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  const storeFilter = params.storeId ? ' AND store_id = ?' : '';
  const storeArgs = params.storeId ? [params.storeId] : [];

  // 1. Actual revenue & target (only rows with real sales)
  const actual = database.prepare(`
    SELECT
      COALESCE(SUM(total_gross), 0) as actual_revenue,
      COALESCE(SUM(target_gross), 0) as target_elapsed
    FROM daily_sales
    WHERE date >= ? AND date <= ? AND total_gross > 0${storeFilter}
  `).get(params.dateFrom, params.dateTo, ...storeArgs) as any;

  // 2. Unique calendar dates with actual sales
  const salesDates = database.prepare(`
    SELECT DISTINCT date
    FROM daily_sales
    WHERE date >= ? AND date <= ? AND total_gross > 0${storeFilter}
    ORDER BY date
  `).all(params.dateFrom, params.dateTo, ...storeArgs) as any[];
  const salesDateSet = new Set(salesDates.map((r: any) => r.date));
  const daysWithSales = salesDateSet.size;

  // 3. Total target for full period (as programmed in backoffice)
  const targetRow = database.prepare(`
    SELECT COALESCE(SUM(target_gross), 0) as target_total
    FROM daily_sales
    WHERE date >= ? AND date <= ?${storeFilter}
  `).get(params.dateFrom, params.dateTo, ...storeArgs) as any;

  // 4. Target for days without sales yet (remaining target)
  const targetRemDB = database.prepare(`
    SELECT COALESCE(SUM(target_gross), 0) as target_remaining
    FROM daily_sales
    WHERE date >= ? AND date <= ? AND (total_gross = 0 OR total_gross IS NULL)${storeFilter}
  `).get(params.dateFrom, params.dateTo, ...storeArgs) as any;

  // 5. Calculate actual/target performance ratio
  //    This tells us what % of the target the team actually achieves
  const actualRevenue = actual.actual_revenue || 0;
  const targetElapsed = actual.target_elapsed || 0;
  const performanceRatio = targetElapsed > 0 ? actualRevenue / targetElapsed : 1;

  // 6. Calculate total calendar days and count remaining
  const dateFrom = new Date(params.dateFrom + 'T00:00:00');
  const dateTo = new Date(params.dateTo + 'T00:00:00');
  const totalDays = Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000) + 1;

  let daysRemaining = 0;
  for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (!salesDateSet.has(dateStr)) daysRemaining++;
  }

  const targetTotal = targetRow.target_total || 0;
  const targetRemaining = targetRemDB.target_remaining || 0;

  // Projection by average: actual + (remaining target × performance ratio)
  // This projects future performance based on how the team performs vs target
  const projectionAvg = actualRevenue + (targetRemaining * performanceRatio);

  // Projection by target: actual + remaining target (if team hits 100% of target)
  const projectionTarget = actualRevenue + targetRemaining;

  const avgDaily = daysWithSales > 0 ? actualRevenue / daysWithSales : 0;
  const requiredDaily = daysRemaining > 0 ? (targetTotal - actualRevenue) / daysRemaining : 0;

  return {
    actual: actualRevenue,
    target_total: targetTotal,
    target_elapsed: targetElapsed,
    target_remaining: targetRemaining,
    projection_avg: projectionAvg,
    projection_target: projectionTarget,
    avg_daily: avgDaily,
    required_daily: requiredDaily,
    days_elapsed: daysWithSales,
    days_total: totalDays,
    days_remaining: daysRemaining,
    performance_ratio: performanceRatio,
  };
}

// ─── ABC Daily ───

// Upsert ABC daily record (idempotent)
export function upsertABCDaily(data: {
  store_id: string;
  date: string;
  article_code: string;
  article_name: string;
  barcode: string;
  qty: number;
  qty_pct: number;
  value_net: number;
  value_gross: number;
  value_pct: number;
  value_cumulative: number;
  cumulative_pct: number;
  ranking: number;
  abc_class: string;
  is_excluded: boolean;
  exclude_reason: string | null;
}): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database
    .prepare('SELECT id FROM abc_daily WHERE store_id = ? AND date = ? AND article_code = ?')
    .get(data.store_id, data.date, data.article_code);

  if (existing) {
    database
      .prepare(
        `UPDATE abc_daily SET
          article_name = ?, barcode = ?, qty = ?, qty_pct = ?,
          value_net = ?, value_gross = ?, value_pct = ?,
          value_cumulative = ?, cumulative_pct = ?, ranking = ?,
          abc_class = ?, is_excluded = ?, exclude_reason = ?
         WHERE store_id = ? AND date = ? AND article_code = ?`
      )
      .run(
        data.article_name, data.barcode, data.qty, data.qty_pct,
        data.value_net, data.value_gross, data.value_pct,
        data.value_cumulative, data.cumulative_pct, data.ranking,
        data.abc_class, data.is_excluded ? 1 : 0, data.exclude_reason,
        data.store_id, data.date, data.article_code
      );
    return 'updated';
  } else {
    database
      .prepare(
        `INSERT INTO abc_daily (store_id, date, article_code, article_name, barcode, qty, qty_pct,
          value_net, value_gross, value_pct, value_cumulative, cumulative_pct, ranking,
          abc_class, is_excluded, exclude_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.store_id, data.date, data.article_code,
        data.article_name, data.barcode, data.qty, data.qty_pct,
        data.value_net, data.value_gross, data.value_pct,
        data.value_cumulative, data.cumulative_pct, data.ranking,
        data.abc_class, data.is_excluded ? 1 : 0, data.exclude_reason
      );
    return 'inserted';
  }
}

// ── Article name aliases (unify items that are the same product) ──
// Map: original name → canonical name
const ARTICLE_ALIASES: Record<string, string> = {
  // Sides / Breads
  'Cheese Garlic Bread': 'Cheesy Garlic Bread',

  // Pizzas
  'Our Spinach Pizza': 'Pizza Our Spinach Pizza',

  // Molhos
  'molho chimichurri': 'Molho Chimichurri',
  'molho ranch': 'Molho Ranch Fumado',
  'molho cheese': 'Molho Cheese & Garlic',
  'molho tomate DIP': 'Molho Marinara',
  'extra m. tomate': 'Extra Molho de Tomate',
  'extra caramelo salgado': 'Extra Caramelo Salgado',
  'Extra Caramelo': 'Extra Caramelo Salgado',

  // Extras (minúscula → maiúscula canónica)
  'extra alho': 'Extra Alho Laminado',
  'extra anchovas': 'Extra Anchovas',
  'extra ananás': 'Extra Ananás',
  'extra bacon': 'Extra Bacon',
  'extra burrata': 'Extra Burrata',
  'extra cebola caramelizada': 'Extra Cebola Caramelizada',
  'extra cogumelos': 'Extra Cogumelos Assados',
  'extra guanciale': 'Extra Guanciale',
  'extra malagueta': 'Extra Picles Malagueta',
  'extra manjericão': 'Extra Manjericão',
  'extra mozzarella': 'Extra Mozzarella',
  'extra pepperoni': 'Extra Pepperoni',

  // Sobremesas
  'Tarte de queijo': 'Cheesecake',

  // Vinhos: "Vinho X" → "X Garrafa" + So → Só
  'So Avesso Copo': 'Só Avesso Copo',
  'So Avesso Garrafa': 'Só Avesso Garrafa',
  'Vinho Ada Pet-Nat': 'Ada Pet-Nat Garrafa',
  'Vinho Antonio Madeira Branco': 'Antonio Madeira Branco Garrafa',
  'Vinho Black Venus': 'Black Venus Garrafa',
  'Vinho Carte Blanche': 'Carte Blanche Garrafa',
  'Vinho Chinado Palhete': 'Chinado Garrafa',
  'Vinho Colar': 'Domino Colar Garrafa',
  'Vinho Drink me Nat Cool': 'Drink me Nat Cool Garrafa',
  "Vinho La Part de l'Été": "La Part de l'Été Garrafa",
  'Vinho La Retahíla': 'La Retahíla Garrafa',
  'Vinho Landcraf': 'Landcraf Garrafa',
  'Vinho Langhe Bianco': 'Langhe Bianco Garrafa',
  'Vinho Meio Rural': 'Meio Rural Garrafa',
  'Vinho Mencia': 'Mencia Garrafa',
  'Vinho Mur X fizel': 'Mur X Fizel Red Garrafa',
  'Vinho NatCool Bairrada': 'NatCool Bairrada Garrafa',
  'Vinho NatCool Rose': 'NatCool Rose Garrafa',
  'Vinho Passo de Gigante': 'Passo de Gigante Garrafa',
  'Vinho Riesling Fass 6 Senior': 'Riesling Fass 6 Senior Garrafa',
  'Vinho Rufia Branco': 'Rufia Branco Garrafa',
  'Vinho Sin Blanca': 'Sin Blanca Garrafa',
  'Vinho So Avesso': 'Só Avesso Garrafa',
  'Vinho Terras de São Vicente': 'Terra de S. Vicente Garrafa',
  'Vinho Vila Vivet': 'Vila Vivet Garrafa',
  'Vinho Zulmira': 'Zulmira Garrafa',
  'Vinho Às de Mirabrás': 'Às de Mirabrás Garrafa',

  // Bebidas
  'Bouche Earlybird': 'Kombucha Bouche Earlybird',
  'Bouche Lemondrop': 'Kombucha Bouche Lemondrop',
  'Coca-cola 0.33L': 'Coca-Cola',
  'Coca-cola Zero 0.33L': 'Coca-Cola Zero',
  'Ummi Hibiscus': 'Ümmi Hibiscus & Berry',
  'Ummi Mango': 'Ümmi Mango Turmeric',
};

// SQL CASE expression that normalizes article_name using aliases
function articleNameExpr(col = 'article_name'): string {
  const entries = Object.entries(ARTICLE_ALIASES);
  if (entries.length === 0) return col;
  let expr = 'CASE';
  for (const [from, to] of entries) {
    expr += ` WHEN ${col} = '${from.replace(/'/g, "''")}' THEN '${to.replace(/'/g, "''")}'`;
  }
  expr += ` ELSE ${col} END`;
  return expr;
}

// ── ABC Category filtering ──
// Maps ABC category to families / subfamilies in article_sales
type ABCCategory = 'all' | 'pizza' | 'pizza_entradas' | 'extras_molhos' | 'bebidas_alcoolicas' | 'soft_drinks' | 'sobremesas';

const ABC_CATEGORY_MAP: Record<Exclude<ABCCategory, 'all'>, {
  families: string[];
  deliverySubfamilies: string[];
  extraArticleFilter?: string;
}> = {
  pizza: {
    families: ['PIZZAS'],
    deliverySubfamilies: ['03 | Pizzas'],
    extraArticleFilter: "(subfamily = '01 | ESPECIAL' AND (article_name LIKE 'Pizza%' OR article_name LIKE 'Our Spinach%'))",
  },
  pizza_entradas: {
    families: ['PIZZAS', 'ENTRADAS'],
    deliverySubfamilies: ['03 | Pizzas', '02 | Entradas', '01 | ESPECIAL'],
  },
  extras_molhos: {
    families: ['PIZZAS EXTRA'],
    deliverySubfamilies: ['Extras Pizzas', '04 | Molhos EXTRA'],
  },
  bebidas_alcoolicas: {
    families: ['CERVEJA', 'VINHOS', 'COCKTAILS'],
    deliverySubfamilies: ['06 | Cerveja MUSA', '07 | Vinhos Naturais'],
    extraArticleFilter: "article_name LIKE '%mmi%'",
  },
  soft_drinks: {
    families: ['SOFT DRINKS'],
    deliverySubfamilies: ['05 | Soft Drinks'],
    extraArticleFilter: "article_name LIKE '%Bouche%'",
  },
  sobremesas: {
    families: ['SOBREMESAS'],
    deliverySubfamilies: ['09 | Sobremesas', 'Extras Sobremesas'],
  },
};

// Lookup article_codes in article_sales that match a given ABC category
function getArticleCodesForCategory(category: ABCCategory): string[] {
  if (category === 'all') return [];
  const map = ABC_CATEGORY_MAP[category];
  if (!map) return [];

  const database = getDb();
  const conditions: string[] = [];
  const args: any[] = [];

  if (map.families.length > 0) {
    conditions.push(`family IN (${map.families.map(() => '?').join(',')})`);
    args.push(...map.families);
  }
  if (map.deliverySubfamilies.length > 0) {
    conditions.push(`subfamily IN (${map.deliverySubfamilies.map(() => '?').join(',')})`);
    args.push(...map.deliverySubfamilies);
  }
  if (map.extraArticleFilter) {
    conditions.push(map.extraArticleFilter);
  }

  const where = conditions.join(' OR ');
  const rows = database.prepare(
    `SELECT DISTINCT article_code FROM article_sales WHERE ${where}`
  ).all(...args) as any[];

  return rows.map((r: any) => r.article_code);
}

// Inject AND article_code IN (...) filter into an abc_daily query
// ABC channel filter: uses JOIN with article_sales to determine delivery vs restaurante
// abc_daily has no family column, so we cross-reference with article_sales
function addABCChannelFilter(query: string, args: any[], channel?: 'all' | 'loja' | 'delivery'): string {
  if (!channel || channel === 'all') return query;
  if (channel === 'delivery') {
    const placeholders = DELIVERY_FAMILIES.map(() => '?').join(',');
    query += ` AND EXISTS (
      SELECT 1 FROM article_sales s
      WHERE s.article_code = abc_daily.article_code
        AND s.store_id = abc_daily.store_id
        AND s.family IN (${placeholders})
    )`;
    args.push(...DELIVERY_FAMILIES);
  } else if (channel === 'loja') {
    const placeholders = DELIVERY_FAMILIES.map(() => '?').join(',');
    query += ` AND EXISTS (
      SELECT 1 FROM article_sales s
      WHERE s.article_code = abc_daily.article_code
        AND s.store_id = abc_daily.store_id
        AND s.family NOT IN (${placeholders})
    )`;
    args.push(...DELIVERY_FAMILIES);
  }
  return query;
}

function addCategoryFilter(query: string, args: any[], category?: string): string {
  if (!category || category === 'all') return query;
  const codes = getArticleCodesForCategory(category as ABCCategory);
  if (codes.length === 0) {
    // No matching articles → force empty result
    query += ' AND 1 = 0';
    return query;
  }
  const placeholders = codes.map(() => '?').join(',');
  query += ` AND article_code IN (${placeholders})`;
  args.push(...codes);
  return query;
}

// ABC class from cumulative percentage (70/90 thresholds)
function abcFromCumulative(pct: number): string {
  if (pct <= 0.70) return 'A';
  if (pct <= 0.90) return 'B';
  return 'C';
}

// ABC Ranking: dual-dimension (value × quantity), unified by article_name
export function getABCRanking(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  const nameExpr = articleNameExpr();

  // Determine inactive cutoff: 14 days before the END of the filtered period (dateTo)
  // This ensures that when filtering by past months, the cutoff is relative to that period,
  // not to the most recent global date (which would mark everything as inactive).
  const cutoffDate = new Date(params.dateTo + 'T00:00:00');
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  const inactiveCutoff = cutoffDate.toISOString().split('T')[0];

  let query = `
    SELECT
      ${nameExpr} as article_name,
      SUM(qty) as total_qty,
      SUM(value_gross) as total_value,
      COUNT(DISTINCT article_code) as code_count,
      GROUP_CONCAT(DISTINCT article_code) as codes,
      AVG(ranking) as avg_ranking,
      MAX(date) as last_sale_date
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query = addABCChannelFilter(query, args, params.channel);
  query = addCategoryFilter(query, args, params.category);
  query += ` GROUP BY ${nameExpr} ORDER BY total_value DESC`;

  const rows = database.prepare(query).all(...args) as any[];

  // --- VALUE dimension (already sorted by total_value DESC) ---
  const totalValue = rows.reduce((sum: number, r: any) => sum + r.total_value, 0);
  let cumValue = 0;
  const valueMap = new Map<string, { value_pct: number; cumulative_value_pct: number; abc_value: string }>();
  for (const r of rows) {
    cumValue += r.total_value;
    const valuePct = totalValue > 0 ? r.total_value / totalValue : 0;
    const cumulativePct = totalValue > 0 ? cumValue / totalValue : 0;
    valueMap.set(r.article_name, { value_pct: valuePct, cumulative_value_pct: cumulativePct, abc_value: abcFromCumulative(cumulativePct) });
  }

  // --- QUANTITY dimension (sort copy by total_qty DESC) ---
  const totalQty = rows.reduce((sum: number, r: any) => sum + r.total_qty, 0);
  const qtySorted = [...rows].sort((a: any, b: any) => b.total_qty - a.total_qty);
  let cumQty = 0;
  const qtyMap = new Map<string, { qty_pct: number; cumulative_qty_pct: number; abc_qty: string; qty_ranking: number }>();
  qtySorted.forEach((r: any, idx: number) => {
    cumQty += r.total_qty;
    const qtyPct = totalQty > 0 ? r.total_qty / totalQty : 0;
    const cumulativePct = totalQty > 0 ? cumQty / totalQty : 0;
    qtyMap.set(r.article_name, { qty_pct: qtyPct, cumulative_qty_pct: cumulativePct, abc_qty: abcFromCumulative(cumulativePct), qty_ranking: idx + 1 });
  });

  // --- Build set of merchandising article codes (exempt from inactive rule) ---
  const allCodes = rows.flatMap((r: any) => (r.codes || '').split(','));
  const merchSet = new Set<string>();
  if (allCodes.length > 0) {
    const placeholders = allCodes.map(() => '?').join(',');
    const merchRows = database.prepare(
      `SELECT DISTINCT article_code FROM article_sales WHERE article_code IN (${placeholders}) AND UPPER(family) = 'MERCHANDISING'`
    ).all(...allCodes) as any[];
    merchRows.forEach((m: any) => merchSet.add(m.article_code));
  }

  // --- Combine (primary sort remains by total_value DESC) ---
  return rows.map((r: any, idx: number) => {
    const v = valueMap.get(r.article_name)!;
    const q = qtyMap.get(r.article_name)!;
    const codes = (r.codes || '').split(',');
    const isMerch = codes.some((c: string) => merchSet.has(c));
    return {
      ...r,
      ranking: idx + 1,
      value_pct: v.value_pct,
      cumulative_pct: v.cumulative_value_pct,           // backward compat for Pareto line
      cumulative_value_pct: v.cumulative_value_pct,
      abc_value: v.abc_value,
      qty_pct: q.qty_pct,
      cumulative_qty_pct: q.cumulative_qty_pct,
      abc_qty: q.abc_qty,
      qty_ranking: q.qty_ranking,
      abc_class: v.abc_value + q.abc_qty,               // e.g. "AA", "BA", "CC"
      inactive: isMerch ? false : r.last_sale_date < inactiveCutoff,
      last_sale_date: r.last_sale_date,
    };
  });
}

// ABC Distribution: 3×3 matrix + single-dimension summaries
export function getABCDistribution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const ranking = getABCRanking(params);
  const totalRevenue = ranking.reduce((sum: number, r: any) => sum + r.total_value, 0);
  const totalQty = ranking.reduce((sum: number, r: any) => sum + r.total_qty, 0);

  // 3×3 matrix
  const matrixDist: Record<string, { count: number; revenue: number; qty: number }> = {};
  for (const v of ['A', 'B', 'C']) {
    for (const q of ['A', 'B', 'C']) {
      matrixDist[v + q] = { count: 0, revenue: 0, qty: 0 };
    }
  }

  // Single-dimension summaries
  const valueDist: Record<string, { count: number; revenue: number }> = { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } };
  const qtyDist: Record<string, { count: number; qty: number }> = { A: { count: 0, qty: 0 }, B: { count: 0, qty: 0 }, C: { count: 0, qty: 0 } };

  for (const r of ranking) {
    const cls = r.abc_class;
    if (matrixDist[cls]) {
      matrixDist[cls].count++;
      matrixDist[cls].revenue += r.total_value;
      matrixDist[cls].qty += r.total_qty;
    }
    valueDist[r.abc_value].count++;
    valueDist[r.abc_value].revenue += r.total_value;
    qtyDist[r.abc_qty].count++;
    qtyDist[r.abc_qty].qty += r.total_qty;
  }

  const matrix = Object.entries(matrixDist).map(([cls, data]) => ({
    class: cls,
    count: data.count,
    revenue: data.revenue,
    qty: data.qty,
    revenue_pct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
    qty_pct: totalQty > 0 ? (data.qty / totalQty) * 100 : 0,
  }));

  const byValue = Object.entries(valueDist).map(([cls, data]) => ({
    class: cls,
    count: data.count,
    revenue: data.revenue,
    pct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
  }));

  const byQty = Object.entries(qtyDist).map(([cls, data]) => ({
    class: cls,
    count: data.count,
    qty: data.qty,
    pct: totalQty > 0 ? (data.qty / totalQty) * 100 : 0,
  }));

  return { matrix, byValue, byQty };
}

// ABC Pareto: top 30 articles with cumulative %
export function getABCPareto(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const ranking = getABCRanking(params);
  return ranking.slice(0, 30);
}

// ABC Evolution: avg ranking by week for top 10 articles
export function getABCEvolution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();

  const nameExpr = articleNameExpr();

  // First get top 10 articles by total value
  const rankingArgs: any[] = [params.dateFrom, params.dateTo];
  let rankingQuery = `
    SELECT ${nameExpr} as article_name
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
  `;
  if (params.storeId) {
    rankingQuery += ' AND store_id = ?';
    rankingArgs.push(params.storeId);
  }
  rankingQuery = addABCChannelFilter(rankingQuery, rankingArgs, params.channel);
  rankingQuery = addCategoryFilter(rankingQuery, rankingArgs, params.category);
  rankingQuery += ` GROUP BY ${nameExpr} ORDER BY SUM(value_gross) DESC LIMIT 10`;

  const topArticles = database.prepare(rankingQuery).all(...rankingArgs) as any[];
  const topNames = topArticles.map((a: any) => a.article_name);
  if (topNames.length === 0) return [];

  // Then get weekly avg ranking for those articles
  const placeholders = topNames.map(() => '?').join(',');
  const args: any[] = [params.dateFrom, params.dateTo, ...topNames];
  let query = `
    SELECT
      strftime('%Y-W%W', date) as week,
      MIN(date) as week_start,
      ${nameExpr} as article_name,
      AVG(ranking) as avg_ranking,
      SUM(value_gross) as week_value
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
      AND ${nameExpr} IN (${placeholders})
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query = addABCChannelFilter(query, args, params.channel);
  query += ` GROUP BY week, ${nameExpr} ORDER BY week ASC`;

  return database.prepare(query).all(...args);
}

// ABC Store Comparison: top 15 per store side by side
export function getABCStoreComparison(params: {
  dateFrom: string;
  dateTo: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];
  const nameExpr = articleNameExpr();

  // Get top 15 articles overall
  let topQuery = `
    SELECT ${nameExpr} as article_name
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
  `;
  topQuery = addABCChannelFilter(topQuery, args, params.channel);
  topQuery = addCategoryFilter(topQuery, args, params.category);
  topQuery += `
    GROUP BY ${nameExpr}
    ORDER BY SUM(value_gross) DESC
    LIMIT 15
  `;
  const topArticles = database.prepare(topQuery).all(...args) as any[];
  const topNames = topArticles.map((a: any) => a.article_name);
  if (topNames.length === 0) return [];

  const placeholders = topNames.map(() => '?').join(',');
  const breakdownArgs: any[] = [params.dateFrom, params.dateTo, ...topNames];
  let query = `
    SELECT
      store_id,
      ${nameExpr} as article_name,
      SUM(qty) as total_qty,
      SUM(value_gross) as total_value
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
      AND ${nameExpr} IN (${placeholders})
  `;
  query = addABCChannelFilter(query, breakdownArgs, params.channel);
  query += `
    GROUP BY store_id, ${nameExpr}
    ORDER BY ${nameExpr} ASC, store_id ASC
  `;

  return database.prepare(query).all(...breakdownArgs);
}

// ABC Concentration: top 5/10/20 as % of total
export function getABCConcentration(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  category?: string;
  channel?: 'all' | 'loja' | 'delivery';
}) {
  const ranking = getABCRanking(params);
  const total = ranking.reduce((sum: number, r: any) => sum + r.total_value, 0);

  const top5 = ranking.slice(0, 5).reduce((sum: number, r: any) => sum + r.total_value, 0);
  const top10 = ranking.slice(0, 10).reduce((sum: number, r: any) => sum + r.total_value, 0);
  const top20 = ranking.slice(0, 20).reduce((sum: number, r: any) => sum + r.total_value, 0);

  return {
    total_articles: ranking.length,
    top5_pct: total > 0 ? (top5 / total) * 100 : 0,
    top10_pct: total > 0 ? (top10 / total) * 100 : 0,
    top20_pct: total > 0 ? (top20 / total) * 100 : 0,
    top5_value: top5,
    top10_value: top10,
    top20_value: top20,
    total_value: total,
  };
}

// ABC date range available in database
export function getABCDateRange() {
  return getDb().prepare('SELECT MIN(date) as min_date, MAX(date) as max_date FROM abc_daily WHERE is_excluded = 0').get() as any;
}

// ─── Insights History ───

export function saveInsight(data: {
  period: string;
  date_from: string;
  date_to: string;
  store_id: string | null;
  channel: string;
  insights: string;
  generated_at: string;
  data_snapshot: string;
}): number {
  const result = getDb().prepare(`
    INSERT INTO insights_history (period, date_from, date_to, store_id, channel, insights, generated_at, data_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.period, data.date_from, data.date_to, data.store_id,
    data.channel, data.insights, data.generated_at, data.data_snapshot
  );
  return result.lastInsertRowid as number;
}

export function getInsightsHistory(params: {
  limit?: number;
  offset?: number;
}): any[] {
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  return getDb().prepare(`
    SELECT id, period, date_from, date_to, store_id, channel,
           insights, generated_at
    FROM insights_history
    ORDER BY generated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function getInsightById(id: number): any {
  return getDb().prepare(`
    SELECT id, period, date_from, date_to, store_id, channel,
           insights, generated_at, data_snapshot
    FROM insights_history
    WHERE id = ?
  `).get(id);
}

// ─── Hourly Sales ───

export function upsertHourlySale(data: {
  store_id: string;
  date: string;
  zone: string;
  time_slot: string;
  num_tickets: number;
  num_customers: number;
  avg_ticket: number;
  avg_per_customer: number;
  total_net: number;
  total_gross: number;
}): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database
    .prepare('SELECT id FROM hourly_sales WHERE store_id = ? AND date = ? AND zone = ? AND time_slot = ?')
    .get(data.store_id, data.date, data.zone, data.time_slot);

  if (existing) {
    database
      .prepare(
        `UPDATE hourly_sales SET
          num_tickets = ?, num_customers = ?, avg_ticket = ?,
          avg_per_customer = ?, total_net = ?, total_gross = ?
         WHERE store_id = ? AND date = ? AND zone = ? AND time_slot = ?`
      )
      .run(
        data.num_tickets, data.num_customers, data.avg_ticket,
        data.avg_per_customer, data.total_net, data.total_gross,
        data.store_id, data.date, data.zone, data.time_slot
      );
    return 'updated';
  } else {
    database
      .prepare(
        `INSERT INTO hourly_sales (store_id, date, zone, time_slot, num_tickets, num_customers,
          avg_ticket, avg_per_customer, total_net, total_gross)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.store_id, data.date, data.zone, data.time_slot,
        data.num_tickets, data.num_customers, data.avg_ticket,
        data.avg_per_customer, data.total_net, data.total_gross
      );
    return 'inserted';
  }
}

// Hourly revenue aggregated by time_slot (for bar chart)
export function getHourlyBySlot(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  zone?: string;
  dayType?: string; // 'all' | 'weekday' | 'weekend'
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  let query = `
    SELECT
      time_slot,
      COALESCE(SUM(total_gross), 0) as total_revenue,
      COALESCE(SUM(num_tickets), 0) as num_tickets,
      COALESCE(SUM(num_customers), 0) as num_customers,
      COUNT(DISTINCT date) as days,
      COALESCE(SUM(total_gross), 0) * 1.0 / MAX(1, COUNT(DISTINCT date)) as avg_revenue
    FROM hourly_sales
    WHERE date >= ? AND date <= ?
  `;

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  if (params.zone) {
    query += ' AND zone = ?';
    args.push(params.zone);
  }
  // dayType: weekday = Mon-Fri (strftime %w 1-5), weekend = Sat-Sun (0,6)
  if (params.dayType === 'weekday') {
    query += " AND CAST(strftime('%w', date) AS INTEGER) BETWEEN 1 AND 5";
  } else if (params.dayType === 'weekend') {
    query += " AND CAST(strftime('%w', date) AS INTEGER) IN (0, 6)";
  }

  query += ' GROUP BY time_slot ORDER BY time_slot ASC';
  return database.prepare(query).all(...args);
}

// Hourly heatmap: avg revenue by time_slot × day_of_week
export function getHourlyHeatmap(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  zone?: string;
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  // strftime('%w', date) returns 0=Sunday, 1=Monday, ..., 6=Saturday
  let query = `
    SELECT
      time_slot,
      CAST(strftime('%w', date) AS INTEGER) as day_of_week,
      COALESCE(SUM(total_gross), 0) * 1.0 / MAX(1, COUNT(DISTINCT date)) as avg_revenue
    FROM hourly_sales
    WHERE date >= ? AND date <= ?
  `;

  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  if (params.zone) {
    query += ' AND zone = ?';
    args.push(params.zone);
  }

  query += ' GROUP BY time_slot, day_of_week ORDER BY time_slot ASC, day_of_week ASC';
  return database.prepare(query).all(...args);
}

// Get distinct zones in hourly_sales for filter options
export function getHourlyZones(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];
  let query = 'SELECT DISTINCT zone FROM hourly_sales WHERE date >= ? AND date <= ?';
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query += ' ORDER BY zone ASC';
  return database.prepare(query).all(...args) as { zone: string }[];
}

// ─── Page Updates / NEW Tags ───

/**
 * Get pages that have updates the user hasn't seen yet.
 */
export function getNewPagesForUser(userId: number): string[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT pu.page_path
    FROM page_updates pu
    LEFT JOIN user_page_views upv
      ON upv.page_path = pu.page_path AND upv.user_id = ?
    WHERE upv.viewed_at IS NULL OR upv.viewed_at < pu.updated_at
  `).all(userId) as { page_path: string }[];
  return rows.map(r => r.page_path);
}

/**
 * Mark a page as viewed by the user (clears the "NEW" badge).
 */
export function markPageViewed(userId: number, pagePath: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO user_page_views (user_id, page_path, viewed_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id, page_path) DO UPDATE SET
      viewed_at = datetime('now')
  `).run(userId, pagePath);
}

// ─── ZSBMS Sync Settings & Log ───

export function getSyncSettings(): any {
  return getDb().prepare('SELECT * FROM sync_settings WHERE id = 1').get() || null;
}

export function upsertSyncSettings(data: {
  zsbms_username?: string;
  zsbms_password_encrypted?: string;
  auto_sync_enabled?: boolean;
  cron_expression?: string;
}): void {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM sync_settings WHERE id = 1').get();

  if (existing) {
    const sets: string[] = [];
    const args: any[] = [];
    if (data.zsbms_username !== undefined) { sets.push('zsbms_username = ?'); args.push(data.zsbms_username); }
    if (data.zsbms_password_encrypted !== undefined) { sets.push('zsbms_password_encrypted = ?'); args.push(data.zsbms_password_encrypted); }
    if (data.auto_sync_enabled !== undefined) { sets.push('auto_sync_enabled = ?'); args.push(data.auto_sync_enabled ? 1 : 0); }
    if (data.cron_expression !== undefined) { sets.push('cron_expression = ?'); args.push(data.cron_expression); }
    sets.push("updated_at = datetime('now')");
    database.prepare(`UPDATE sync_settings SET ${sets.join(', ')} WHERE id = 1`).run(...args);
  } else {
    database.prepare(`
      INSERT INTO sync_settings (id, zsbms_username, zsbms_password_encrypted, auto_sync_enabled, cron_expression)
      VALUES (1, ?, ?, ?, ?)
    `).run(
      data.zsbms_username || null,
      data.zsbms_password_encrypted || null,
      data.auto_sync_enabled ? 1 : 0,
      data.cron_expression || '0 7 * * 1',
    );
  }
}

export function createSyncLog(triggerType: 'manual' | 'cron'): number {
  const result = getDb().prepare(`
    INSERT INTO sync_log (status, trigger_type, started_at)
    VALUES ('running', ?, datetime('now'))
  `).run(triggerType);
  return result.lastInsertRowid as number;
}

export function updateSyncLog(id: number, data: {
  status: 'success' | 'partial' | 'failed';
  reports_succeeded?: number;
  reports_failed?: number;
  total_inserted?: number;
  total_updated?: number;
  details?: string;
  error?: string;
}): void {
  getDb().prepare(`
    UPDATE sync_log SET
      status = ?, finished_at = datetime('now'),
      reports_succeeded = ?, reports_failed = ?,
      total_inserted = ?, total_updated = ?,
      details = ?, error = ?
    WHERE id = ?
  `).run(
    data.status,
    data.reports_succeeded || 0,
    data.reports_failed || 0,
    data.total_inserted || 0,
    data.total_updated || 0,
    data.details || null,
    data.error || null,
    id,
  );
}

export function getSyncHistory(limit: number = 20): any[] {
  return getDb().prepare('SELECT * FROM sync_log ORDER BY started_at DESC LIMIT ?').all(limit);
}

export function getLatestSync(): any {
  return getDb().prepare('SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1').get() || null;
}
