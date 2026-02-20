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

export function getQuickFilterDates(filter: QuickFilter): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  switch (filter) {
    case 'this_week':
      return {
        dateFrom: fmt(startOfWeek(now, { weekStartsOn: 1 })),
        dateTo: fmt(now),
      };
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

export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  return getQuickFilterDates('last_week');
}
