import { useState, useEffect } from 'react';
import { InsightsPanel } from '@/components/insights/InsightsPanel';
import { InsightsHistory } from '@/components/insights/InsightsHistory';
import { DatePicker } from '@/components/ui/date-picker';
import { generateInsights, fetchLastSalesDate } from '@/lib/api';
import type { InsightsPeriod, InsightsChannel, InsightsGenerateResponse } from '@/types';
import { Sparkles, Store, Truck, LayoutGrid, Calendar } from 'lucide-react';
import { format, parse, startOfWeek, endOfWeek, subWeeks, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear, isValid } from 'date-fns';

const PERIOD_TABS: { value: InsightsPeriod; label: string }[] = [
  { value: 'week', label: 'Semana passada' },
  { value: 'month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'year', label: 'Este ano' },
  { value: 'last_year', label: 'Ano passado' },
];

const CHANNEL_OPTIONS: { value: InsightsChannel; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: 'Todos', icon: LayoutGrid },
  { value: 'loja', label: 'Restaurante', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Truck },
];

/** Compute the date range for a given period using the real last-sales-date */
function computeDatesForPeriod(
  p: InsightsPeriod,
  lastSalesDate?: string | null,
) {
  const now = new Date();
  let endDate = now;
  if (lastSalesDate) {
    const parsed = parse(lastSalesDate, 'yyyy-MM-dd', new Date());
    if (isValid(parsed)) endDate = parsed;
  }
  const endStr = format(endDate, 'yyyy-MM-dd');

  switch (p) {
    case 'week': {
      const lastWeek = subWeeks(now, 1);
      return {
        dateFrom: format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        dateTo: format(endOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      };
    }
    case 'month':
      return { dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'), dateTo: endStr };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return {
        dateFrom: format(startOfMonth(lm), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(lm), 'yyyy-MM-dd'),
      };
    }
    case 'year':
      return { dateFrom: format(startOfYear(now), 'yyyy-MM-dd'), dateTo: endStr };
    case 'last_year': {
      const ly = subYears(now, 1);
      return {
        dateFrom: format(startOfYear(ly), 'yyyy-MM-dd'),
        dateTo: format(endOfYear(ly), 'yyyy-MM-dd'),
      };
    }
    default:
      return { dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'), dateTo: endStr };
  }
}

export function InsightsPage() {
  // Local state (independent from FilterContext)
  const [period, setPeriod] = useState<InsightsPeriod>('month');
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [channel, setChannel] = useState<InsightsChannel>('all');

  // Last sales date (fetched from server to show real data cutoff)
  const [lastSalesDate, setLastSalesDate] = useState<string | null>(null);

  // Date pickers — always visible, auto-computed from period
  const initDates = computeDatesForPeriod('month');
  const [dateFrom, setDateFrom] = useState(initDates.dateFrom);
  const [dateTo, setDateTo] = useState(initDates.dateTo);

  useEffect(() => {
    fetchLastSalesDate(storeId)
      .then((date) => {
        setLastSalesDate(date);
        // Recompute dates for current period with real end date
        const d = computeDatesForPeriod(period, date);
        setDateFrom(d.dateFrom);
        setDateTo(d.dateTo);
      })
      .catch(() => setLastSalesDate(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  /** When a period pill is clicked, auto-set dates */
  const handlePeriodChange = (p: InsightsPeriod) => {
    setPeriod(p);
    if (p !== 'custom') {
      const d = computeDatesForPeriod(p, lastSalesDate);
      setDateFrom(d.dateFrom);
      setDateTo(d.dateTo);
    }
  };

  /** When dates are changed manually, switch to custom */
  const handleDateFromChange = (v: string) => {
    setDateFrom(v);
    setPeriod('custom');
  };
  const handleDateToChange = (v: string) => {
    setDateTo(v);
    setPeriod('custom');
  };

  // Insights state
  const [insightsData, setInsightsData] = useState<InsightsGenerateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setInsightsData(null);
    try {
      const result = await generateInsights({
        period,
        dateFrom,
        dateTo,
        ...(storeId && { storeId }),
        channel,
      });
      setInsightsData(result);
      if (result.error === 'api_key_missing') {
        setError(result.message || 'API key nao configurada');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar insights');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle loading insight from history
  const handleLoadFromHistory = (data: InsightsGenerateResponse) => {
    setInsightsData(data);
    setError(null);
  };

  const canGenerate = !!(dateFrom && dateTo);

  return (
    <div className="space-y-4">
        {/* Sticky header + filters */}
        <div className="sticky top-14 md:top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 sticky-header-bg border-b border-border">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-5 w-5 text-lupita-amber" />
            <h1 className="text-xl font-bold text-foreground">Insights AI</h1>
          </div>

          {/* Filters row 1: Date range + Store + Channel (matches Dashboard/Artigos/ABC) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date range — always visible */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <DatePicker value={dateFrom} onChange={handleDateFromChange} />
              <span className="text-sm text-muted-foreground">até</span>
              <DatePicker value={dateTo} onChange={handleDateToChange} />
            </div>

            {/* Store filter */}
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <select
                value={storeId || ''}
                onChange={(e) => setStoreId(e.target.value || undefined)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todas as lojas</option>
                <option value="cais_do_sodre">Cais do Sodré</option>
                <option value="alvalade">Alvalade</option>
              </select>
            </div>

            {/* Channel filter (grouped container like Artigos/ABC) */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {CHANNEL_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = channel === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setChannel(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-lupita-amber text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters row 2: Period pills + Histórico & Generate (matches quick filter row) */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handlePeriodChange(tab.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  period === tab.value
                    ? 'bg-lupita-amber text-white'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-lupita-amber/50'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* Histórico + Generate grouped together on the right */}
            <div className="flex items-center gap-2 ml-auto">
              <InsightsHistory onLoadInsight={handleLoadFromHistory} />
              <button
                onClick={handleGenerate}
                disabled={isLoading || !canGenerate}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-lupita-amber text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {insightsData?.insights ? 'Regenerar' : 'Gerar Insights'}
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="w-full">
          <InsightsPanel data={insightsData} isLoading={isLoading} error={error} />
        </div>
    </div>
  );
}
