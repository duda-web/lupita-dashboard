import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FilterState, ComparisonType, QuickFilter } from '@/types';
import { getDefaultDateRange, getQuickFilterDates } from '@/lib/dateUtils';

interface FilterContextType {
  filters: FilterState;
  activeQuickFilter: QuickFilter | null;
  setDateRange: (dateFrom: string, dateTo: string) => void;
  setStoreId: (storeId: string | undefined) => void;
  setComparison: (comparison: ComparisonType) => void;
  applyQuickFilter: (filter: QuickFilter) => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const defaultRange = getDefaultDateRange();
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: defaultRange.dateFrom,
    dateTo: defaultRange.dateTo,
    storeId: undefined,
    comparison: 'wow',
  });
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter | null>('last_week');

  const setDateRange = (dateFrom: string, dateTo: string) => {
    setFilters((prev) => ({ ...prev, dateFrom, dateTo }));
    setActiveQuickFilter(null); // manual date change clears quick filter
  };

  const setStoreId = (storeId: string | undefined) => {
    setFilters((prev) => ({ ...prev, storeId }));
  };

  const setComparison = (comparison: ComparisonType) => {
    setFilters((prev) => ({ ...prev, comparison }));
  };

  const applyQuickFilter = (filter: QuickFilter) => {
    const { dateFrom, dateTo } = getQuickFilterDates(filter);
    setFilters((prev) => ({ ...prev, dateFrom, dateTo }));
    setActiveQuickFilter(filter);
  };

  return (
    <FilterContext.Provider
      value={{ filters, activeQuickFilter, setDateRange, setStoreId, setComparison, applyQuickFilter }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useFilters must be used within FilterProvider');
  return context;
}
