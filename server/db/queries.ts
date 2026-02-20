import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

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

// Get aggregated KPIs for a period
export function getKPIs(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
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

// Get KPIs grouped by store
export function getKPIsByStore(params: {
  dateFrom: string;
  dateTo: string;
}) {
  return getDb().prepare(`
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

// Get weekly aggregated data for charts
export function getWeeklyData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
  // ISO week: strftime('%W', date) gives week number
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

// Get daily data grouped by day of week
export function getDayOfWeekData(params: {
  dateFrom: string;
  dateTo: string;
}) {
  return getDb().prepare(`
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

// Get monthly data for comparison charts
export function getMonthlyData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();
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

// Get heatmap data (daily, optionally filtered by store)
export function getHeatmapData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
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
  return getDb().prepare(query).all(...args);
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
  let query = `
    SELECT
      GROUP_CONCAT(DISTINCT article_code) as article_code,
      article_name,
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
  query += ` GROUP BY article_name ORDER BY total_revenue DESC LIMIT ?`;
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
  // First get top articles by name
  const topArgs: any[] = [params.dateTo, params.dateFrom];
  let topQuery = `
    SELECT article_name as key_val
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  if (params.storeId) {
    topQuery += ' AND store_id = ?';
    topArgs.push(params.storeId);
  }
  topQuery = addChannelFilter(topQuery, topArgs, channel);
  topQuery += ` GROUP BY article_name ORDER BY SUM(revenue_gross) DESC LIMIT ?`;
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
      article_name as article_code,
      article_name,
      COALESCE(SUM(revenue_gross), 0) as total_revenue,
      COALESCE(SUM(qty_sold), 0) as total_qty
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
      AND article_name IN (${placeholders})
  `;
  if (params.storeId) {
    trendQuery += ' AND store_id = ?';
    trendArgs.push(params.storeId);
  }
  trendQuery = addChannelFilter(trendQuery, trendArgs, channel);
  trendQuery += ` GROUP BY month, article_name ORDER BY month ASC, total_revenue DESC`;

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
  const topArgs: any[] = [params.dateTo, params.dateFrom];
  let topQuery = `
    SELECT article_name
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
  `;
  topQuery = addChannelFilter(topQuery, topArgs, channel);
  topQuery += ` GROUP BY article_name ORDER BY SUM(revenue_gross) DESC LIMIT ?`;
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
      article_name,
      COALESCE(SUM(qty_sold), 0) as total_qty,
      COALESCE(SUM(revenue_net), 0) as total_net,
      COALESCE(SUM(revenue_gross), 0) as total_revenue
    FROM article_sales
    WHERE date_from <= ? AND date_to >= ?
      AND article_name IN (${placeholders})
  `;
  query = addChannelFilter(query, args, channel);
  query += ` GROUP BY store_id, article_name ORDER BY article_name ASC, store_id ASC`;

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
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  let query = `
    SELECT
      article_name,
      SUM(qty) as total_qty,
      SUM(value_gross) as total_value,
      COUNT(DISTINCT article_code) as code_count,
      GROUP_CONCAT(DISTINCT article_code) as codes,
      AVG(ranking) as avg_ranking
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query += ' GROUP BY article_name ORDER BY total_value DESC';

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

  // --- Combine (primary sort remains by total_value DESC) ---
  return rows.map((r: any, idx: number) => {
    const v = valueMap.get(r.article_name)!;
    const q = qtyMap.get(r.article_name)!;
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
    };
  });
}

// ABC Distribution: 3×3 matrix + single-dimension summaries
export function getABCDistribution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
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
}) {
  const ranking = getABCRanking(params);
  return ranking.slice(0, 30);
}

// ABC Evolution: avg ranking by week for top 10 articles
export function getABCEvolution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}) {
  const database = getDb();

  // First get top 10 articles by total value
  const rankingArgs: any[] = [params.dateFrom, params.dateTo];
  let rankingQuery = `
    SELECT article_name
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
  `;
  if (params.storeId) {
    rankingQuery += ' AND store_id = ?';
    rankingArgs.push(params.storeId);
  }
  rankingQuery += ' GROUP BY article_name ORDER BY SUM(value_gross) DESC LIMIT 10';

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
      article_name,
      AVG(ranking) as avg_ranking,
      SUM(value_gross) as week_value
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
      AND article_name IN (${placeholders})
  `;
  if (params.storeId) {
    query += ' AND store_id = ?';
    args.push(params.storeId);
  }
  query += ' GROUP BY week, article_name ORDER BY week ASC';

  return database.prepare(query).all(...args);
}

// ABC Store Comparison: top 15 per store side by side
export function getABCStoreComparison(params: {
  dateFrom: string;
  dateTo: string;
}) {
  const database = getDb();
  const args: any[] = [params.dateFrom, params.dateTo];

  // Get top 15 articles overall
  const topQuery = `
    SELECT article_name
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
    GROUP BY article_name
    ORDER BY SUM(value_gross) DESC
    LIMIT 15
  `;
  const topArticles = database.prepare(topQuery).all(...args) as any[];
  const topNames = topArticles.map((a: any) => a.article_name);
  if (topNames.length === 0) return [];

  const placeholders = topNames.map(() => '?').join(',');
  const breakdownArgs: any[] = [params.dateFrom, params.dateTo, ...topNames];
  const query = `
    SELECT
      store_id,
      article_name,
      SUM(qty) as total_qty,
      SUM(value_gross) as total_value
    FROM abc_daily
    WHERE date >= ? AND date <= ? AND is_excluded = 0
      AND article_name IN (${placeholders})
    GROUP BY store_id, article_name
    ORDER BY article_name ASC, store_id ASC
  `;

  return database.prepare(query).all(...breakdownArgs);
}

// ABC Concentration: top 5/10/20 as % of total
export function getABCConcentration(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
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
