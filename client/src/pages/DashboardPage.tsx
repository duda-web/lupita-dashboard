import { useState, useEffect, useRef } from 'react';
import { Filters } from '@/components/dashboard/Filters';
import { KPICard } from '@/components/dashboard/KPICard';
import { StoreCard } from '@/components/dashboard/StoreCard';
import { MTDCard } from '@/components/dashboard/MTDCard';
import { YTDCard } from '@/components/dashboard/YTDCard';
import { WeeklyRevenueChart } from '@/components/dashboard/WeeklyRevenueChart';
import { WeeklyTicketChart } from '@/components/dashboard/WeeklyTicketChart';
import { DayOfWeekChart } from '@/components/dashboard/DayOfWeekChart';
import { MonthlyComparisonChart } from '@/components/dashboard/MonthlyComparisonChart';
import { StoreMixChart } from '@/components/dashboard/StoreMixChart';
import { TargetChart } from '@/components/dashboard/TargetChart';
import { CustomersChart } from '@/components/dashboard/CustomersChart';
import { HeatmapChart } from '@/components/dashboard/HeatmapChart';
import { ZoneMixChart } from '@/components/dashboard/ZoneMixChart';
import { ZoneTrendChart } from '@/components/dashboard/ZoneTrendChart';
import { DataTable } from '@/components/dashboard/DataTable';
import { ProjectionCard } from '@/components/dashboard/ProjectionCard';
import { useFilters } from '@/context/FilterContext';
import { fetchKPIs, fetchMTD, fetchYTD, fetchChartData, fetchDailyData, fetchProjection } from '@/lib/api';
import type { KPIResponse, MTDResponse, YTDResponse, DailySaleRow, ProjectionResponse } from '@/types';
import { subWeeks, subYears, startOfYear, endOfYear, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Upload, LayoutDashboard, TrendingUp, Receipt, Ticket, Users, UserCheck, Target } from 'lucide-react';

const COMPARISON_SHORT_LABELS: Record<string, string> = {
  wow: 'vs sem. anterior',
  mom: 'vs mês anterior',
  yoy: 'vs ano anterior',
};

/** Format comparison label with the actual dates, e.g. "vs sem. anterior (09/01 – 15/01)" */
function buildComparisonLabel(comparison: string, compPeriod?: { dateFrom: string; dateTo: string }): string {
  const base = COMPARISON_SHORT_LABELS[comparison] || '';
  if (!compPeriod) return base;
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  };
  return `${base} (${fmt(compPeriod.dateFrom)} – ${fmt(compPeriod.dateTo)})`;
}

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];


export function DashboardPage() {
  const { filters, lastSalesDate } = useFilters();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [mtd, setMtd] = useState<MTDResponse | null>(null);
  const [ytd, setYtd] = useState<YTDResponse | null>(null);
  const [weeklyRevenue, setWeeklyRevenue] = useState<any[]>([]);
  const [weeklyTicket, setWeeklyTicket] = useState<any[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<any[]>([]);
  const [currentYearMonthly, setCurrentYearMonthly] = useState<any[]>([]);
  const [prevYearMonthly, setPrevYearMonthly] = useState<any[]>([]);
  const [targetData, setTargetData] = useState<any[]>([]);
  const [customersData, setCustomersData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [zoneMixData, setZoneMixData] = useState<any>({ zones: [], storeBreakdown: [] });
  const [zoneTrendData, setZoneTrendData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<DailySaleRow[]>([]);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [hasData, setHasData] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!hasLoadedOnce.current) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      try {
        // Load KPIs
        const kpiResult = await fetchKPIs({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          storeId: filters.storeId,
          comparison: filters.comparison,
        });
        setKpis(kpiResult);
        setHasData(kpiResult.kpis.revenue.value > 0 || kpiResult.kpis.tickets.value > 0);

        // Load MTD, YTD, and Projection
        const [mtdResult, ytdResult, projResult] = await Promise.all([
          fetchMTD(filters.storeId),
          fetchYTD(filters.storeId),
          fetchProjection(filters.storeId),
        ]);
        setMtd(mtdResult);
        setYtd(ytdResult);
        setProjection(projResult);

        // Load chart data (12 weeks back for weekly charts)
        // Use last sales date instead of today for accurate data cutoff
        const effectiveToday = lastSalesDate || format(new Date(), 'yyyy-MM-dd');
        const now = new Date();
        const twelveWeeksAgo = format(subWeeks(now, 12), 'yyyy-MM-dd');

        const [weekly, ticket, dow, target, customers, heatmap, zMix, zTrend] = await Promise.all([
          fetchChartData('weekly_revenue', { dateFrom: twelveWeeksAgo, dateTo: effectiveToday, storeId: filters.storeId }),
          fetchChartData('weekly_ticket', { dateFrom: twelveWeeksAgo, dateTo: effectiveToday, storeId: filters.storeId }),
          fetchChartData('day_of_week', { dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
          fetchChartData('target', { dateFrom: twelveWeeksAgo, dateTo: effectiveToday, storeId: filters.storeId }),
          fetchChartData('customers', { dateFrom: twelveWeeksAgo, dateTo: effectiveToday, storeId: filters.storeId }),
          fetchChartData('heatmap', { dateFrom: filters.dateFrom, dateTo: filters.dateTo, storeId: filters.storeId }),
          fetchChartData('zone_mix', { dateFrom: filters.dateFrom, dateTo: filters.dateTo, storeId: filters.storeId }),
          fetchChartData('zone_trend', { dateFrom: twelveWeeksAgo, dateTo: effectiveToday, storeId: filters.storeId }),
        ]);

        setWeeklyRevenue(weekly);
        setWeeklyTicket(ticket);
        setDayOfWeek(dow);
        setTargetData(target);
        setCustomersData(customers);
        setHeatmapData(heatmap);
        setZoneMixData(zMix);
        setZoneTrendData(zTrend);

        // Monthly comparison: current year vs previous year
        const yearStart = format(startOfYear(now), 'yyyy-MM-dd');
        const prevYearStart = format(startOfYear(subYears(now, 1)), 'yyyy-MM-dd');
        const prevYearEnd = format(endOfYear(subYears(now, 1)), 'yyyy-MM-dd');

        const [currentMonthly, prevMonthly] = await Promise.all([
          fetchChartData('monthly', { dateFrom: yearStart, dateTo: effectiveToday, storeId: filters.storeId }),
          fetchChartData('monthly', { dateFrom: prevYearStart, dateTo: prevYearEnd, storeId: filters.storeId }),
        ]);
        setCurrentYearMonthly(currentMonthly);
        setPrevYearMonthly(prevMonthly);

        // Load daily detail
        const daily = await fetchDailyData({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          storeId: filters.storeId,
        });
        setDailyData(daily);
      } catch (err) {
        console.error('Dashboard load error:', err);
        setHasData(false);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        hasLoadedOnce.current = true;
      }
    };

    load();
  }, [filters, lastSalesDate]);

  return (
    <div className="space-y-4">
        {/* Sticky header + filters */}
        <div className="sticky top-14 md:top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 sticky-header-bg border-b border-border">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <LayoutDashboard className="h-5 w-5 text-lupita-amber" />
            <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          </div>

          {/* Filters */}
          <Filters />
        </div>

        {/* Initial loading state (first load only) */}
        {isLoading && !hasLoadedOnce.current && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-80 rounded-xl bg-card animate-pulse" />
              <div className="h-80 rounded-xl bg-card animate-pulse" />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-muted p-6 mb-6">
              <Upload className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Sem dados no dashboard</h2>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Importa ficheiros .xlsx do backoffice para começar a ver as métricas.
            </p>
            <button
              onClick={() => navigate('/upload')}
              className="px-6 py-2.5 rounded-lg bg-lupita-amber text-white font-medium hover:bg-amber-600 transition-colors"
            >
              Ir para Upload
            </button>
          </div>
        )}

        {/* Main content — stays visible during refresh */}
        {hasData && (
          <div className={`space-y-4 transition-opacity duration-200 ${isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            {isRefreshing && (
              <div className="flex items-center justify-center mb-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-lupita-amber border-t-transparent" />
              </div>
            )}
            {/* KPI Cards */}
            {kpis && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KPICard
                  title="Faturação"
                  value={kpis.kpis.revenue.value}
                  variation={kpis.kpis.revenue.variation}
                  format="currency"
                  delay={0}
                  icon={TrendingUp}
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
                <KPICard
                  title="vs Objectivo"
                  value={kpis.kpis.target.value}
                  variation={kpis.kpis.target.variation}
                  format="currency"
                  delay={0.05}
                  icon={Target}
                  iconColor="text-violet-500"
                  comparisonLabel="vs objectivo"
                />
                <KPICard
                  title="Clientes"
                  value={kpis.kpis.customers.value}
                  variation={kpis.kpis.customers.variation}
                  format="integer"
                  delay={0.1}
                  icon={Users}
                  iconColor="text-blue-500"
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
                <KPICard
                  title="VM Pessoa"
                  value={kpis.kpis.avgPerCustomer.value}
                  variation={kpis.kpis.avgPerCustomer.variation}
                  format="currency"
                  delay={0.15}
                  icon={UserCheck}
                  iconColor="text-emerald-500"
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
                <KPICard
                  title="Tickets"
                  value={kpis.kpis.tickets.value}
                  variation={kpis.kpis.tickets.variation}
                  format="integer"
                  delay={0.2}
                  icon={Ticket}
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
                <KPICard
                  title="Ticket Médio"
                  value={kpis.kpis.avgTicket.value}
                  variation={kpis.kpis.avgTicket.variation}
                  format="currency"
                  delay={0.25}
                  icon={Receipt}
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
              </div>
            )}

            {/* Store cards + MTD + YTD */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis?.stores.map((store, i) => (
                <StoreCard
                  key={store.store_id}
                  storeId={store.store_id}
                  revenue={store.revenue}
                  mix={store.mix}
                  variation={store.variation}
                  target={store.target}
                  customers={store.customers}
                  avgPerCustomer={store.customers > 0 ? store.revenue / store.customers : 0}
                  delay={0.05 * i}
                  comparisonLabel={buildComparisonLabel(filters.comparison, kpis?.comparisonPeriod)}
                />
              ))}
              {mtd && (
                <MTDCard
                  current={mtd.current}
                  previousMonth={mtd.previousMonth}
                  variationMoM={mtd.variationMoM}
                  variationYoY={mtd.variationYoY}
                  projection={mtd.projection}
                  progress={mtd.progress}
                  daysElapsed={mtd.daysElapsed}
                  daysInMonth={mtd.daysInMonth}
                  monthLabel={`${MONTH_NAMES_PT[new Date().getMonth()]} ${new Date().getFullYear()}`}
                />
              )}
              {ytd && (
                <YTDCard
                  current={ytd.current}
                  previousYear={ytd.previousYear}
                  variation={ytd.variation}
                  customers={ytd.customers}
                  avgPerCustomer={ytd.customers > 0 ? ytd.current / ytd.customers : 0}
                  yearLabel={`${new Date().getFullYear()}`}
                />
              )}
            </div>

            {/* Projection card (MTD) */}
            {projection && projection.target_total > 0 && (
              <ProjectionCard data={projection} />
            )}

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WeeklyRevenueChart data={weeklyRevenue} />
              <WeeklyTicketChart data={weeklyTicket} />
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DayOfWeekChart data={dayOfWeek} />
              <MonthlyComparisonChart
                currentYearData={currentYearMonthly}
                previousYearData={prevYearMonthly}
              />
            </div>

            {/* Charts row 3 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TargetChart data={targetData} />
              <StoreMixChart stores={kpis?.stores || []} />
              <CustomersChart data={customersData} />
            </div>

            {/* Zone charts row */}
            {(zoneMixData?.zones?.length > 0 || zoneTrendData.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ZoneMixChart data={zoneMixData} />
                <div className="lg:col-span-2">
                  <ZoneTrendChart data={zoneTrendData} />
                </div>
              </div>
            )}

            {/* Heatmap */}
            <HeatmapChart data={heatmapData} />

            {/* Data table */}
            <DataTable data={dailyData} />
          </div>
        )}
      </div>
  );
}
