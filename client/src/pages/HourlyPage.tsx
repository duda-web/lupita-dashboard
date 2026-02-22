import { useState, useEffect, useRef } from 'react';
import { Filters } from '@/components/dashboard/Filters';
import { HourlyRevenueChart } from '@/components/dashboard/HourlyRevenueChart';
import { HourlyHeatmapChart } from '@/components/dashboard/HourlyHeatmapChart';
import { HourlyDetailTable } from '@/components/dashboard/HourlyDetailTable';
import { useFilters } from '@/context/FilterContext';
import { fetchChartData } from '@/lib/api';
import type { HourlySlotData, HourlyHeatmapData } from '@/types';
import { formatCurrency, formatInteger } from '@/lib/formatters';
import { Clock, TrendingUp, Ticket, Users, Receipt, LayoutGrid, Armchair, Truck, ShoppingBag } from 'lucide-react';
import { motion } from 'framer-motion';

export function HourlyPage() {
  const { filters, lastSalesDate } = useFilters();

  // Local zone filter — does not affect other pages
  const [hourlyZone, setHourlyZone] = useState<string>('all');
  const [hourlySlotData, setHourlySlotData] = useState<HourlySlotData[]>([]);
  const [hourlyHeatmapData, setHourlyHeatmapData] = useState<HourlyHeatmapData[]>([]);
  const [globalHeatmapData, setGlobalHeatmapData] = useState<HourlyHeatmapData[]>([]);
  const [hourlyZones, setHourlyZones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  // Fetch global (unfiltered) heatmap data + zones — only depends on date/store, NOT zone
  useEffect(() => {
    const loadGlobal = async () => {
      try {
        const [globalHeatmap, zones] = await Promise.all([
          fetchChartData('hourly_heatmap', {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            storeId: filters.storeId,
          }),
          fetchChartData('hourly_zones', {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            storeId: filters.storeId,
          }),
        ]);
        setGlobalHeatmapData(globalHeatmap as unknown as HourlyHeatmapData[]);
        setHourlyZones((zones as any[]).map((z: any) => z.zone));
      } catch (err) {
        console.error('Global heatmap load error:', err);
        setGlobalHeatmapData([]);
      }
    };
    loadGlobal();
  }, [filters.dateFrom, filters.dateTo, filters.storeId, lastSalesDate]);

  // Persistent Y-axis max across all filter changes (ref survives re-renders)
  const chartYMaxRef = useRef(0);

  // Fetch zone-filtered data + weekend max for unified Y scale
  useEffect(() => {
    const loadHourly = async () => {
      if (!hasLoadedOnce.current) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      try {
        const zoneParam = hourlyZone !== 'all' ? hourlyZone : undefined;
        const baseParams = {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          storeId: filters.storeId,
          zone: zoneParam,
        };
        const [slots, heatmap, weekendSlots] = await Promise.all([
          fetchChartData('hourly_revenue', baseParams),
          fetchChartData('hourly_heatmap', baseParams),
          // Pre-fetch weekend data to know the true Y-axis max upfront
          fetchChartData('hourly_revenue', { ...baseParams, dayType: 'weekend' }),
        ]);
        setHourlySlotData(slots as unknown as HourlySlotData[]);
        setHourlyHeatmapData(heatmap as unknown as HourlyHeatmapData[]);
        // Compute unified Y max from both "all" and "weekend" (weekend is always the highest)
        const allMax = Math.max(...(slots as any[]).map((d: any) => d.avg_revenue), 0);
        const weMax = Math.max(...(weekendSlots as any[]).map((d: any) => d.avg_revenue), 0);
        chartYMaxRef.current = Math.max(allMax, weMax);
      } catch (err) {
        console.error('Hourly data load error:', err);
        setHourlySlotData([]);
        setHourlyHeatmapData([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        hasLoadedOnce.current = true;
      }
    };
    loadHourly();
  }, [filters.dateFrom, filters.dateTo, filters.storeId, hourlyZone, lastSalesDate]);

  // Compute summary KPIs from slot data
  const totalRevenue = hourlySlotData.reduce((sum, d) => sum + d.total_revenue, 0);
  const numDays = hourlySlotData.length > 0 ? hourlySlotData[0].days : 0;

  // Peak revenue slot
  const peakSlot = hourlySlotData.length > 0
    ? hourlySlotData.reduce((a, b) => a.avg_revenue > b.avg_revenue ? a : b)
    : null;

  // Peak VM Pessoa (revenue per customer) by slot
  const peakVmPessoa = hourlySlotData.length > 0
    ? hourlySlotData.reduce((best, d) => {
        const vm = d.num_customers > 0 ? d.total_revenue / d.num_customers : 0;
        const bestVm = best.num_customers > 0 ? best.total_revenue / best.num_customers : 0;
        return vm > bestVm ? d : best;
      })
    : null;
  const peakVmPessoaValue = peakVmPessoa && peakVmPessoa.num_customers > 0
    ? peakVmPessoa.total_revenue / peakVmPessoa.num_customers : 0;

  // Peak Ticket Médio (revenue per ticket) by slot
  const peakTicketMedio = hourlySlotData.length > 0
    ? hourlySlotData.reduce((best, d) => {
        const tm = d.num_tickets > 0 ? d.total_revenue / d.num_tickets : 0;
        const bestTm = best.num_tickets > 0 ? best.total_revenue / best.num_tickets : 0;
        return tm > bestTm ? d : best;
      })
    : null;
  const peakTicketMedioValue = peakTicketMedio && peakTicketMedio.num_tickets > 0
    ? peakTicketMedio.total_revenue / peakTicketMedio.num_tickets : 0;

  // Peak Customers per day by slot
  const peakCustomers = hourlySlotData.length > 0
    ? hourlySlotData.reduce((best, d) => {
        const avg = d.days > 0 ? d.num_customers / d.days : 0;
        const bestAvg = best.days > 0 ? best.num_customers / best.days : 0;
        return avg > bestAvg ? d : best;
      })
    : null;
  const peakCustomersValue = peakCustomers && peakCustomers.days > 0
    ? peakCustomers.num_customers / peakCustomers.days : 0;

  // Peak Tickets per day by slot
  const peakTickets = hourlySlotData.length > 0
    ? hourlySlotData.reduce((best, d) => {
        const avg = d.days > 0 ? d.num_tickets / d.days : 0;
        const bestAvg = best.days > 0 ? best.num_tickets / best.days : 0;
        return avg > bestAvg ? d : best;
      })
    : null;
  const peakTicketsValue = peakTickets && peakTickets.days > 0
    ? peakTickets.num_tickets / peakTickets.days : 0;

  return (
    <div className="space-y-4">
      {/* Sticky header + filters */}
      <div className="sticky top-14 md:top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 sticky-header-bg border-b border-border">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Clock className="h-5 w-5 text-lupita-amber" />
          <h1 className="text-xl font-bold text-foreground">Faturação / Horário</h1>
        </div>

        {/* Filters (reuse global filters — date range + store, hide comparison) */}
        <Filters hideComparison>
          {/* Zone filter pills inline */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 ml-2">
            {['all', ...hourlyZones.filter((z) => z !== 'Espera')].map((z) => {
              const isActive = hourlyZone === z;
              const Icon = z === 'all' ? LayoutGrid
                : z.toLowerCase().includes('delivery') ? Truck
                : z.toLowerCase().includes('takeaway') ? ShoppingBag
                : Armchair; // Sala
              return (
                <button
                  key={z}
                  onClick={() => setHourlyZone(z)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-lupita-amber text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {z === 'all' ? 'Todas' : z}
                </button>
              );
            })}
          </div>

        </Filters>
      </div>

      {/* Initial loading state (first load only) */}
      {isLoading && !hasLoadedOnce.current && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-80 rounded-xl bg-card animate-pulse" />
            <div className="h-80 rounded-xl bg-card animate-pulse" />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && hourlySlotData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="rounded-full bg-muted p-6 mb-6">
            <Clock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Sem dados horários</h2>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Importa ficheiros "Totais Apurados por Hora" do backoffice para ver a análise horária.
          </p>
        </div>
      )}

      {/* Main content — stays visible during refresh */}
      {hourlySlotData.length > 0 && (
        <div className={`space-y-4 transition-opacity duration-200 ${isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {isRefreshing && (
            <div className="flex items-center justify-center mb-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-lupita-amber border-t-transparent" />
            </div>
          )}
          {/* Summary KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Faturação */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-lupita-amber" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Faturação</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{formatCurrency(totalRevenue)}</p>
              <p className="text-[10px] text-muted-foreground">{numDays} dias no período</p>
            </motion.div>

            {/* Hora de Pico (faturação) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-violet-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hora de Pico</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{peakSlot?.time_slot || '—'}</p>
              <p className="text-[10px] text-muted-foreground">{peakSlot ? `${formatCurrency(peakSlot.avg_revenue)} média/dia` : ''}</p>
            </motion.div>

            {/* Pico Clientes */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pico Clientes</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{peakCustomersValue > 0 ? peakCustomersValue.toFixed(1).replace('.', ',') : '—'}</p>
              <p className="text-[10px] text-muted-foreground">{peakCustomers ? `às ${peakCustomers.time_slot} · média/dia` : ''}</p>
            </motion.div>

            {/* Pico VM Pessoa */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pico VM Pessoa</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{peakVmPessoaValue > 0 ? formatCurrency(peakVmPessoaValue) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">{peakVmPessoa ? `às ${peakVmPessoa.time_slot}` : ''}</p>
            </motion.div>

            {/* Pico Tickets */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Ticket className="h-3.5 w-3.5 text-lupita-amber" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pico Tickets</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{peakTicketsValue > 0 ? peakTicketsValue.toFixed(1).replace('.', ',') : '—'}</p>
              <p className="text-[10px] text-muted-foreground">{peakTickets ? `às ${peakTickets.time_slot} · média/dia` : ''}</p>
            </motion.div>

            {/* Pico Ticket Médio */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Receipt className="h-3.5 w-3.5 text-lupita-amber" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pico Ticket Médio</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{peakTicketMedioValue > 0 ? formatCurrency(peakTicketMedioValue) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">{peakTicketMedio ? `às ${peakTicketMedio.time_slot}` : ''}</p>
            </motion.div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HourlyRevenueChart
              data={hourlySlotData}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              storeId={filters.storeId}
              zone={hourlyZone !== 'all' ? hourlyZone : undefined}
              yMax={chartYMaxRef.current}
            />
            <HourlyHeatmapChart
              data={hourlyHeatmapData}
              globalData={globalHeatmapData}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              storeId={filters.storeId}
              zone={hourlyZone !== 'all' ? hourlyZone : undefined}
            />
          </div>

          {/* Detail table */}
          <HourlyDetailTable
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            storeId={filters.storeId}
            zone={hourlyZone !== 'all' ? hourlyZone : undefined}
          />
        </div>
      )}
    </div>
  );
}
