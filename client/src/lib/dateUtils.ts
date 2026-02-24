import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subYears,
  format,
} from 'date-fns';
import type { QuickFilter } from '@/types';

/**
 * Returns date range for a quick filter.
 * @param filter - The quick filter type
 * @param _lastSalesDate - Deprecated, kept for API compat. Always uses today as end date.
 */
export function getQuickFilterDates(
  filter: QuickFilter,
  _lastSalesDate?: string | null
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  switch (filter) {
    case 'last_week': {
      const lastWeek = subWeeks(now, 1);
      return {
        dateFrom: fmt(startOfWeek(lastWeek, { weekStartsOn: 1 })),
        dateTo: fmt(endOfWeek(lastWeek, { weekStartsOn: 1 })),
      };
    }
    case 'this_month':
      return {
        dateFrom: fmt(startOfMonth(now)),
        dateTo: fmt(now),
      };
    case 'last_month': {
      const lastMonth = subMonths(now, 1);
      return {
        dateFrom: fmt(startOfMonth(lastMonth)),
        dateTo: fmt(endOfMonth(lastMonth)),
      };
    }
    case 'this_year':
      return {
        dateFrom: fmt(startOfYear(now)),
        dateTo: fmt(now),
      };
    case 'last_year': {
      const lastYear = subYears(now, 1);
      return {
        dateFrom: fmt(startOfYear(lastYear)),
        dateTo: fmt(endOfYear(lastYear)),
      };
    }
  }
}

export function getDefaultDateRange(lastSalesDate?: string | null): { dateFrom: string; dateTo: string } {
  return getQuickFilterDates('last_week', lastSalesDate);
}
