// Auth types
export interface User {
  id: number;
  username: string;
  role: 'admin' | 'viewer';
}

export interface LoginResponse {
  token: string;
  user: User;
}

// KPI types
export interface KPIValue {
  value: number;
  previous: number;
  variation: number | null;
}

export interface TargetKPI {
  value: number;
  actual: number;
  difference: number;
  variation: number | null;
}

export interface StoreKPI {
  store_id: string;
  revenue: number;
  tickets: number;
  customers: number;
  target: number;
  mix: number;
  variation: number | null;
}

export interface KPIResponse {
  period: { dateFrom: string; dateTo: string };
  comparisonPeriod: { dateFrom: string; dateTo: string };
  comparison: ComparisonType;
  kpis: {
    revenue: KPIValue;
    avgTicket: KPIValue;
    tickets: KPIValue;
    customers: KPIValue;
    avgPerCustomer: KPIValue;
    target: TargetKPI;
  };
  stores: StoreKPI[];
}

export interface MTDResponse {
  current: number;
  previousMonth: number;
  yoy: number;
  variationMoM: number | null;
  variationYoY: number | null;
  projection: number;
  progress: number;
  daysElapsed: number;
  daysInMonth: number;
}

export interface YTDResponse {
  current: number;
  previousYear: number;
  variation: number | null;
  tickets: number;
  customers: number;
}

export interface ProjectionDelta {
  euros: number;
  pct: number | null;
}

export interface ProjectionResponse {
  actual: number;
  target_total: number;
  target_elapsed: number;
  target_remaining: number;
  projection_avg: number;
  projection_target: number;
  avg_daily: number;
  required_daily: number;
  days_elapsed: number;
  days_total: number;
  days_remaining: number;
  month_label: string;
  performance_ratio: number;
  delta_avg_vs_target: ProjectionDelta;
  delta_objTarget_vs_target: ProjectionDelta;
  delta_avg_vs_objTarget: ProjectionDelta;
}

// Chart types
export interface WeeklyDataPoint {
  week: string;
  week_start: string;
  store_id: string;
  total_revenue: number;
  total_tickets: number;
  total_customers: number;
  total_target: number;
  open_days: number;
}

export interface DayOfWeekDataPoint {
  day_of_week: string;
  store_id: string;
  avg_revenue: number | null;
  avg_tickets: number | null;
  days_open: number;
}

export interface MonthlyDataPoint {
  month: string;
  store_id: string;
  total_revenue: number;
  total_tickets: number;
  total_customers: number;
  total_target: number;
}

export interface HeatmapDataPoint {
  date: string;
  day_of_week: string;
  total_revenue: number;
}

// Zone types
export interface ZoneMixDataPoint {
  zone: string;
  total_revenue: number;
  total_net: number;
}

export interface ZoneStoreBreakdownPoint {
  zone: string;
  store_id: string;
  total_revenue: number;
  total_net: number;
}

export interface ZoneMixResponse {
  zones: ZoneMixDataPoint[];
  storeBreakdown: ZoneStoreBreakdownPoint[];
}

export interface ZoneTrendDataPoint {
  week: string;
  week_start: string;
  zone: string;
  total_revenue: number;
}

// Article types
export interface ArticleDataPoint {
  article_code: string;
  article_name: string;
  family: string;
  subfamily: string;
  total_qty: number;
  total_net: number;
  total_revenue: number;
}

export interface FamilyMixDataPoint {
  family: string;
  total_revenue: number;
  total_qty: number;
  article_count: number;
}

export interface CategoryMixDataPoint {
  category: string;
  total_revenue: number;
  total_qty: number;
  article_count: number;
}

export interface ArticleTrendDataPoint {
  month?: string;
  date_from: string;
  date_to: string;
  article_code: string;
  article_name: string;
  total_revenue: number;
  total_qty: number;
}

export interface ArticleByStoreDataPoint {
  store_id: string;
  article_name: string;
  total_qty: number;
  total_net: number;
  total_revenue: number;
}

export interface ChannelSplitData {
  delivery_revenue: number;
  delivery_qty: number;
  loja_revenue: number;
  loja_qty: number;
  total_revenue: number;
  total_qty: number;
}

// Daily sales detail
export interface DailySaleRow {
  id: number;
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
}

// Import types
export interface ImportResult {
  filename: string;
  dateFrom: string | null;
  dateTo: string | null;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
  stores: string[];
}

export interface ImportResponse {
  success: boolean;
  summary: {
    filesProcessed: number;
    totalInserted: number;
    totalUpdated: number;
    errors: string[];
  };
  details: ImportResult[];
}

export interface ImportLogEntry {
  id: number;
  filename: string;
  imported_at: string;
  date_from: string;
  date_to: string;
  records_inserted: number;
  records_updated: number;
  errors: string | null;
}

// Filter types
export type ComparisonType = 'wow' | 'mom' | 'yoy';
export type QuickFilter = 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year';

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  storeId: string | undefined;
  comparison: ComparisonType;
}

// Store info
export interface Store {
  store_id: string;
  display_name: string;
  raw_name: string;
  open_days: string;
  opened_date: string;
}

// ABC Category filter
export type ABCCategory = 'all' | 'pizza' | 'pizza_entradas' | 'extras_molhos' | 'bebidas_alcoolicas' | 'soft_drinks' | 'sobremesas';

// ABC Analysis types — dual-dimension (Value × Quantity)
export type ABCSingleClass = 'A' | 'B' | 'C';
export type ABCMatrixClass = 'AA' | 'AB' | 'AC' | 'BA' | 'BB' | 'BC' | 'CA' | 'CB' | 'CC';

export interface ABCArticle {
  article_name: string;
  codes: string;
  total_qty: number;
  total_value: number;
  value_pct: number;
  cumulative_pct: number;
  cumulative_value_pct: number;
  qty_pct: number;
  cumulative_qty_pct: number;
  abc_class: string;          // "AA", "AB", "CA", etc.
  abc_value: ABCSingleClass;
  abc_qty: ABCSingleClass;
  avg_ranking: number;
  ranking: number;
  qty_ranking: number;
  code_count: number;
  inactive: boolean;
  last_sale_date: string;
}

export interface ABCMatrixDistribution {
  class: string;
  count: number;
  revenue: number;
  qty: number;
  revenue_pct: number;
  qty_pct: number;
}

export interface ABCSingleDistribution {
  class: string;
  count: number;
  revenue?: number;
  qty?: number;
  pct: number;
}

export interface ABCDistributionResponse {
  matrix: ABCMatrixDistribution[];
  byValue: ABCSingleDistribution[];
  byQty: ABCSingleDistribution[];
}

export interface ABCConcentration {
  total_articles: number;
  top5_pct: number;
  top10_pct: number;
  top20_pct: number;
  top5_value: number;
  top10_value: number;
  top20_value: number;
  total_value: number;
}

export interface ABCEvolutionPoint {
  week: string;
  week_start: string;
  article_name: string;
  avg_ranking: number;
  week_value: number;
}

export interface ABCStoreComparisonPoint {
  store_id: string;
  article_name: string;
  total_qty: number;
  total_value: number;
}

export interface ABCInsightsResponse {
  insights?: string;
  generated_at?: string;
  error?: string;
  message?: string;
}

// ── Comprehensive Insights IA ──

export type InsightsPeriod = 'week' | 'month' | 'year' | 'custom';
export type InsightsChannel = 'all' | 'loja' | 'delivery';

export interface InsightsGenerateRequest {
  period: InsightsPeriod;
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  channel?: InsightsChannel;
}

export interface InsightsGenerateResponse {
  id?: number;
  insights?: string;
  generated_at?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  storeId?: string | null;
  channel?: string;
  error?: string;
  message?: string;
}

export interface InsightsHistoryEntry {
  id: number;
  period: string;
  date_from: string;
  date_to: string;
  store_id: string | null;
  channel: string;
  insights: string;
  generated_at: string;
}

// ── Hourly data ──

export interface HourlySlotData {
  time_slot: string;
  total_revenue: number;
  num_tickets: number;
  num_customers: number;
  avg_revenue: number;
  days: number;
}

export interface HourlyHeatmapData {
  time_slot: string;
  day_of_week: number;
  avg_revenue: number;
}

// ── ZSBMS Sync ──

export interface SyncSettings {
  zsbms_username: string;
  has_password: boolean;
  auto_sync_enabled: boolean;
  cron_expression: string;
}

// ── Report Registry ──

export interface ReportDisplayInfo {
  key: string;
  title: string;
  zsbmsPath: string;
  periods: string[];
  extraRules?: string[];
}

export interface ReportRegistryResponse {
  commonRules: string[];
  reports: ReportDisplayInfo[];
}

export interface SyncLogEntry {
  id: number;
  status: 'running' | 'success' | 'partial' | 'failed';
  trigger_type: 'manual' | 'cron';
  started_at: string;
  finished_at: string | null;
  reports_succeeded: number;
  reports_failed: number;
  total_inserted: number;
  total_updated: number;
  details: string | null;
  error: string | null;
}

export interface SyncStatusResponse {
  running: boolean;
  currentSyncId: number | null;
  latest: SyncLogEntry | null;
}

export interface SyncTriggerResponse {
  ok: boolean;
  syncId: number;
}

// Matrix labels, colors, and Tailwind classes for 9 dual-dimension classes
export const ABC_MATRIX_LABELS: Record<string, {
  label: string;
  labelShort: string;
  color: string;
  bgClass: string;
  textClass: string;
}> = {
  AA: { label: 'Estrela Absoluta', labelShort: 'Estrela', color: '#10b981', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30', textClass: 'text-emerald-700 dark:text-emerald-400' },
  AB: { label: 'Premium', labelShort: 'Premium', color: '#6366f1', bgClass: 'bg-indigo-100 dark:bg-indigo-900/30', textClass: 'text-indigo-700 dark:text-indigo-400' },
  AC: { label: 'Premium Nicho', labelShort: 'Nicho', color: '#8b5cf6', bgClass: 'bg-violet-100 dark:bg-violet-900/30', textClass: 'text-violet-700 dark:text-violet-400' },
  BA: { label: 'Popular Barato', labelShort: 'Popular', color: '#f59e0b', bgClass: 'bg-amber-100 dark:bg-amber-900/30', textClass: 'text-amber-700 dark:text-amber-400' },
  BB: { label: 'Core', labelShort: 'Core', color: '#3b82f6', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  BC: { label: 'Oportunidade', labelShort: 'Oportun.', color: '#a855f7', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-700 dark:text-purple-400' },
  CA: { label: 'Subvalorizado', labelShort: 'Subval.', color: '#ec4899', bgClass: 'bg-pink-100 dark:bg-pink-900/30', textClass: 'text-pink-700 dark:text-pink-400' },
  CB: { label: 'Baixo', labelShort: 'Baixo', color: '#f97316', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-400' },
  CC: { label: 'Candidato a Sair', labelShort: 'Eliminar', color: '#ef4444', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
};
