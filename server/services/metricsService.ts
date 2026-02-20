import {
  getKPIs,
  getKPIsByStore,
  getWeeklyData,
  getDayOfWeekData,
  getMonthlyData,
  getHeatmapData,
  getDailySales,
  getDateRange,
  getZoneMix,
  getZoneWeeklyTrend,
  getTopArticles,
  getFamilyMix,
  getArticleTrend,
  getArticlesByStore,
  getChannelSplit,
  getCategoryMix,
  getProjectionData,
} from '../db/queries';
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  subMonths,
  subYears,
  format,
  parseISO,
  differenceInDays,
} from 'date-fns';

export type ComparisonType = 'wow' | 'mom' | 'yoy';

interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export function getComparisonPeriod(
  dateFrom: string,
  dateTo: string,
  type: ComparisonType
): DateRange {
  const from = parseISO(dateFrom);
  const to = parseISO(dateTo);
  const daysDiff = differenceInDays(to, from);

  switch (type) {
    case 'wow': {
      const prevFrom = subWeeks(from, 1);
      const prevTo = subWeeks(to, 1);
      return {
        dateFrom: format(prevFrom, 'yyyy-MM-dd'),
        dateTo: format(prevTo, 'yyyy-MM-dd'),
      };
    }
    case 'mom': {
      const prevFrom = subMonths(from, 1);
      const prevTo = subMonths(to, 1);
      return {
        dateFrom: format(prevFrom, 'yyyy-MM-dd'),
        dateTo: format(prevTo, 'yyyy-MM-dd'),
      };
    }
    case 'yoy': {
      const prevFrom = subYears(from, 1);
      const prevTo = subYears(to, 1);
      return {
        dateFrom: format(prevFrom, 'yyyy-MM-dd'),
        dateTo: format(prevTo, 'yyyy-MM-dd'),
      };
    }
  }
}

function calcVariation(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function computeKPIsWithComparison(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  comparison: ComparisonType;
}) {
  const current = getKPIs({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    storeId: params.storeId,
  });

  const prevPeriod = getComparisonPeriod(params.dateFrom, params.dateTo, params.comparison);
  const previous = getKPIs({
    dateFrom: prevPeriod.dateFrom,
    dateTo: prevPeriod.dateTo,
    storeId: params.storeId,
  });

  const avgTicket = current.total_tickets > 0
    ? current.total_revenue / current.total_tickets
    : 0;
  const prevAvgTicket = previous.total_tickets > 0
    ? previous.total_revenue / previous.total_tickets
    : 0;

  const avgPerCustomer = current.total_customers > 0
    ? current.total_revenue / current.total_customers
    : 0;
  const prevAvgPerCustomer = previous.total_customers > 0
    ? previous.total_revenue / previous.total_customers
    : 0;

  // Store breakdown
  const storeBreakdown = getKPIsByStore({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const prevStoreBreakdown = getKPIsByStore({
    dateFrom: prevPeriod.dateFrom,
    dateTo: prevPeriod.dateTo,
  });

  const storeData = storeBreakdown.map((store: any) => {
    const prev = prevStoreBreakdown.find((p: any) => p.store_id === store.store_id);
    return {
      store_id: store.store_id,
      revenue: store.total_revenue,
      tickets: store.total_tickets,
      customers: store.total_customers,
      target: store.total_target,
      mix: current.total_revenue > 0
        ? (store.total_revenue / current.total_revenue) * 100
        : 0,
      variation: prev ? calcVariation(store.total_revenue, prev.total_revenue) : null,
    };
  });

  return {
    period: { dateFrom: params.dateFrom, dateTo: params.dateTo },
    comparisonPeriod: prevPeriod,
    comparison: params.comparison,
    kpis: {
      revenue: {
        value: current.total_revenue,
        previous: previous.total_revenue,
        variation: calcVariation(current.total_revenue, previous.total_revenue),
      },
      avgTicket: {
        value: avgTicket,
        previous: prevAvgTicket,
        variation: calcVariation(avgTicket, prevAvgTicket),
      },
      tickets: {
        value: current.total_tickets,
        previous: previous.total_tickets,
        variation: calcVariation(current.total_tickets, previous.total_tickets),
      },
      customers: {
        value: current.total_customers,
        previous: previous.total_customers,
        variation: calcVariation(current.total_customers, previous.total_customers),
      },
      avgPerCustomer: {
        value: avgPerCustomer,
        previous: prevAvgPerCustomer,
        variation: calcVariation(avgPerCustomer, prevAvgPerCustomer),
      },
      target: {
        value: current.total_target,
        actual: current.total_revenue,
        difference: current.total_revenue - current.total_target,
        variation: current.total_target > 0
          ? ((current.total_revenue - current.total_target) / current.total_target) * 100
          : null,
      },
    },
    stores: storeData,
  };
}

export function computeMTD(storeId?: string) {
  const now = new Date();
  const currentMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');
  const dayOfMonth = now.getDate();

  // Current MTD
  const currentMTD = getKPIs({ dateFrom: currentMonthStart, dateTo: today, storeId });

  // Previous month same days
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
  const prevMonthSameDay = format(subMonths(now, 1), 'yyyy-MM-dd');
  // Adjust to same day count
  const prevMonth = subMonths(now, 1);
  const prevMTDEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(dayOfMonth, new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()));
  const prevMTD = getKPIs({
    dateFrom: prevMonthStart,
    dateTo: format(prevMTDEnd, 'yyyy-MM-dd'),
    storeId,
  });

  // YoY same period
  const yoyMonthStart = format(startOfMonth(subYears(now, 1)), 'yyyy-MM-dd');
  const yoyNow = subYears(now, 1);
  const yoyMTDEnd = new Date(yoyNow.getFullYear(), yoyNow.getMonth(), Math.min(dayOfMonth, new Date(yoyNow.getFullYear(), yoyNow.getMonth() + 1, 0).getDate()));
  const yoyMTD = getKPIs({
    dateFrom: yoyMonthStart,
    dateTo: format(yoyMTDEnd, 'yyyy-MM-dd'),
    storeId,
  });

  // Projection: avg daily revenue * days in month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const openDays = currentMTD.open_days || 1;
  const avgDaily = currentMTD.total_revenue / openDays;
  const projection = avgDaily * daysInMonth;

  return {
    current: currentMTD.total_revenue,
    previousMonth: prevMTD.total_revenue,
    yoy: yoyMTD.total_revenue,
    variationMoM: calcVariation(currentMTD.total_revenue, prevMTD.total_revenue),
    variationYoY: calcVariation(currentMTD.total_revenue, yoyMTD.total_revenue),
    projection,
    progress: projection > 0 ? (currentMTD.total_revenue / projection) * 100 : 0,
    daysElapsed: dayOfMonth,
    daysInMonth,
  };
}

export function computeYTD(storeId?: string) {
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today = format(now, 'yyyy-MM-dd');

  const currentYTD = getKPIs({ dateFrom: yearStart, dateTo: today, storeId });

  const prevYearStart = `${now.getFullYear() - 1}-01-01`;
  const prevYearSameDay = format(subYears(now, 1), 'yyyy-MM-dd');
  const prevYTD = getKPIs({ dateFrom: prevYearStart, dateTo: prevYearSameDay, storeId });

  return {
    current: currentYTD.total_revenue,
    previousYear: prevYTD.total_revenue,
    variation: calcVariation(currentYTD.total_revenue, prevYTD.total_revenue),
    tickets: currentYTD.total_tickets,
    customers: currentYTD.total_customers,
  };
}

export function getChartData(params: {
  type: string;
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  channel?: string;
}) {
  const articleParams = {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    storeId: params.storeId,
    channel: (params.channel || 'all') as 'all' | 'loja' | 'delivery',
  };

  switch (params.type) {
    case 'weekly_revenue':
    case 'weekly_ticket':
    case 'customers':
      return getWeeklyData({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'day_of_week':
      return getDayOfWeekData({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
    case 'monthly':
      return getMonthlyData({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'heatmap':
      return getHeatmapData({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'target':
      return getWeeklyData({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'zone_mix':
      return getZoneMix({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'zone_trend':
      return getZoneWeeklyTrend({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'top_articles':
      return getTopArticles(articleParams);
    case 'family_mix':
      return getFamilyMix({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'article_trend':
      return getArticleTrend(articleParams);
    case 'articles_by_store':
      return getArticlesByStore(articleParams);
    case 'channel_split':
      return getChannelSplit({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        storeId: params.storeId,
      });
    case 'category_mix':
      return getCategoryMix(articleParams);
    default:
      return [];
  }
}

export function computeProjection(storeId?: string) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  // End of current month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const data = getProjectionData({
    dateFrom: monthStart,
    dateTo: monthEnd,
    storeId,
  });

  function delta(a: number, b: number) {
    const euros = a - b;
    const pct = b !== 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : null);
    return { euros, pct };
  }

  return {
    ...data,
    month_label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    delta_avg_vs_target: delta(data.projection_avg, data.target_total),
    delta_objTarget_vs_target: delta(data.projection_target, data.target_total),
    delta_avg_vs_objTarget: delta(data.projection_avg, data.projection_target),
  };
}
