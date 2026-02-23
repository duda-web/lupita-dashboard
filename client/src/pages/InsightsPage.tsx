import { useState, useEffect } from 'react';
import { InsightsPanel } from '@/components/insights/InsightsPanel';
import { InsightsHistory } from '@/components/insights/InsightsHistory';
import { DatePicker } from '@/components/ui/date-picker';
import { generateInsights, fetchLastSalesDate } from '@/lib/api';
import type { InsightsPeriod, InsightsChannel, InsightsGenerateResponse } from '@/types';
import { Sparkles, Store, Truck, LayoutGrid, Calendar } from 'lucide-react';
import { format, parse, startOfWeek, endOfWeek, subWeeks, startOfMonth, startOfYear, isValid } from 'date-fns';

const PERIOD_TABS: { value: InsightsPeriod; label: string; hasABC: boolean }[] = [
  { value: 'week', label: 'Semana Passada', hasABC: false },
  { value: 'month', label: 'Este Mes', hasABC: true },
  { value: 'year', label: 'Este Ano', hasABC: true },
  { value: 'custom', label: 'Personalizado', hasABC: true },
];

const CHANNEL_OPTIONS: { value: InsightsChannel; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: 'Todos', icon: LayoutGrid },
  { value: 'loja', label: 'Restaurante', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Truck },
];

function getDefaultCustomDates(lastSalesDate?: string | null) {
  const now = new Date();
  let endDate = format(now, 'yyyy-MM-dd');
  if (lastSalesDate) endDate = lastSalesDate;
  return {
    dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'),
    dateTo: endDate,
  };
}

export function InsightsPage() {
  // Local state (independent from FilterContext)
  const [period, setPeriod] = useState<InsightsPeriod>('month');
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [channel, setChannel] = useState<InsightsChannel>('all');

  const defaults = getDefaultCustomDates();
  const [customDateFrom, setCustomDateFrom] = useState(defaults.dateFrom);
  const [customDateTo, setCustomDateTo] = useState(defaults.dateTo);

  // Last sales date (fetched from server to show real data cutoff)
  const [lastSalesDate, setLastSalesDate] = useState<string | null>(null);

  useEffect(() => {
    fetchLastSalesDate(storeId)
      .then((date) => {
        setLastSalesDate(date);
        // Also update custom date picker default end date
        setCustomDateTo(date);
      })
      .catch(() => setLastSalesDate(null));
  }, [storeId]);

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
        ...(period === 'custom' && { dateFrom: customDateFrom, dateTo: customDateTo }),
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

  // Period date range labels — uses real last sales date from server
  const getPeriodDescription = () => {
    const now = new Date();
    // Use the server-provided last sales date, falling back to today
    let endDate = now;
    if (lastSalesDate) {
      const parsed = parse(lastSalesDate, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) endDate = parsed;
    }

    switch (period) {
      case 'week': {
        const lastWeek = subWeeks(now, 1);
        const from = format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'dd/MM');
        const to = format(endOfWeek(lastWeek, { weekStartsOn: 1 }), 'dd/MM');
        return `${from} - ${to} (sem ABC)`;
      }
      case 'month': {
        const from = format(startOfMonth(now), 'dd/MM');
        const to = format(endDate, 'dd/MM');
        return `${from} - ${to}`;
      }
      case 'year': {
        const from = format(startOfYear(now), 'dd/MM');
        const to = format(endDate, 'dd/MM');
        return `${from} - ${to}`;
      }
      default:
        return '';
    }
  };

  const canGenerate = period !== 'custom' || (customDateFrom && customDateTo);

  return (
    <div className="space-y-4">
        {/* Sticky header + filters */}
        <div className="sticky top-14 md:top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 sticky-header-bg border-b border-border">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-5 w-5 text-lupita-amber" />
            <h1 className="text-xl font-bold text-foreground">Insights AI</h1>
          </div>

          {/* Filters row 1: Store + Channel + Custom dates (matches Artigos/ABC layout) */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
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

            {/* Custom date pickers (only when period === 'custom') */}
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <DatePicker value={customDateFrom} onChange={setCustomDateFrom} />
                <span className="text-sm text-muted-foreground">até</span>
                <DatePicker value={customDateTo} onChange={setCustomDateTo} />
              </div>
            )}
          </div>

          {/* Filters row 2: Period pills + Generate + Histórico (matches quick filter row) */}
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setPeriod(tab.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  period === tab.value
                    ? 'bg-lupita-amber text-white'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-lupita-amber/50'
                }`}
              >
                {tab.label}
                {tab.hasABC && period !== tab.value && (
                  <span className="ml-1 text-[9px] opacity-60">+ABC</span>
                )}
              </button>
            ))}
            {period !== 'custom' && (
              <span className="text-[10px] text-muted-foreground ml-1">
                {getPeriodDescription()}
              </span>
            )}

            <div className="h-6 w-px bg-border mx-1" />

            <InsightsHistory onLoadInsight={handleLoadFromHistory} />

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isLoading || !canGenerate}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-lupita-amber text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {insightsData?.insights ? 'Regenerar' : 'Gerar Insights'}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="w-full">
          <InsightsPanel data={insightsData} isLoading={isLoading} error={error} />
        </div>
    </div>
  );
}
