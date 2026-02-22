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
  parse,
  isValid,
} from 'date-fns';
import type { QuickFilter } from '@/types';

/**
 * Returns date range for a quick filter.
 * @param filter - The quick filter type
 * @param lastSalesDate - Optional last date with actual sales data (yyyy-MM-dd).
 *   Used for 'this_month' and 'this_year' to avoid querying dates without imported data.
 */
export function getQuickFilterDates(
  filter: QuickFilter,
  lastSalesDate?: string | null
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  // Resolve the effective "today" — use last sales date if available
  let effectiveToday = now;
  if (lastSalesDate) {
    const parsed = parse(lastSalesDate, 'yyyy-MM-dd', new Date());
    if (isValid(parsed)) effectiveToday = parsed;
  }

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
        dateTo: fmt(effectiveToday),
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
        dateTo: fmt(effectiveToday),
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
