import type { ReactNode } from 'react';
import { useFilters } from '@/context/FilterContext';
import { COMPARISON_LABELS, QUICK_FILTER_LABELS } from '@/lib/constants';
import type { ComparisonType, QuickFilter } from '@/types';
import { Calendar, Store, ArrowLeftRight } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

interface FiltersProps {
  children?: ReactNode;
}

export function Filters({ children }: FiltersProps) {
  const { filters, activeQuickFilter, setDateRange, setStoreId, setComparison, applyQuickFilter } = useFilters();

  const quickFilters: QuickFilter[] = ['this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year'];
  const comparisons: ComparisonType[] = ['wow', 'mom', 'yoy'];

  return (
    <div className="space-y-3">
      {/* Date range and store */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <DatePicker
            value={filters.dateFrom}
            onChange={(v) => setDateRange(v, filters.dateTo)}
          />
          <span className="text-sm text-muted-foreground">até</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(v) => setDateRange(filters.dateFrom, v)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <select
            value={filters.storeId || ''}
            onChange={(e) => setStoreId(e.target.value || undefined)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as lojas</option>
            <option value="cais_do_sodre">Cais do Sodré</option>
            <option value="alvalade">Alvalade</option>
          </select>
        </div>

        {children}
      </div>

      {/* Quick filters and comparison */}
      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((qf) => (
          <button
            key={qf}
            onClick={() => applyQuickFilter(qf)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeQuickFilter === qf
                ? 'bg-lupita-amber text-white'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-lupita-amber/50'
            }`}
          >
            {QUICK_FILTER_LABELS[qf]}
          </button>
        ))}

        <div className="h-6 w-px bg-border mx-1" />

        <div className="flex items-center gap-1">
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {comparisons.map((c) => (
            <button
              key={c}
              onClick={() => setComparison(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filters.comparison === c
                  ? 'bg-lupita-amber text-white'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
