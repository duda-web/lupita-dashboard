import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ArticleTrendDataPoint } from '@/types';
import { ARTICLE_TREND_COLORS } from '@/lib/constants';
import { formatCurrency } from '@/lib/formatters';

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function formatPeriod(d: ArticleTrendDataPoint): string {
  // If backend returns month field (e.g. "2025-03"), use it
  if (d.month) {
    const [year, mm] = d.month.split('-');
    return `${MONTH_LABELS[mm] || mm} ${year}`;
  }
  // Fallback: same date_from/date_to = single day, format as month
  if (d.date_from === d.date_to) {
    const [year, mm] = d.date_from.split('-');
    return `${MONTH_LABELS[mm] || mm} ${year}`;
  }
  // Period range
  return `${d.date_from} - ${d.date_to}`;
}

interface Props {
  data: ArticleTrendDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground truncate max-w-[140px]">{entry.name}:</span>
          <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ArticleTrendChart({ data }: Props) {
  const { chartData, articleNames } = useMemo(() => {
    if (data.length === 0) return { chartData: [], articleNames: [] };

    // Get unique periods using the month field or formatted date range
    const periodSet = new Map<string, string>(); // raw key -> display label
    data.forEach((d) => {
      const key = d.month || `${d.date_from} - ${d.date_to}`;
      if (!periodSet.has(key)) {
        periodSet.set(key, formatPeriod(d));
      }
    });
    const periods = [...periodSet.entries()]; // [[key, label], ...]

    // Get unique articles by article_name (already unified by backend when channel=all)
    const articleNames = [...new Set(data.map((d) => d.article_name))];

    // Truncate long names
    const truncated = articleNames.map((name) =>
      name.length > 30 ? name.slice(0, 28) + '...' : name
    );

    // Pivot: one row per period, columns per article
    const pivoted = periods.map(([key, label]) => {
      const row: any = { period: label };
      articleNames.forEach((name, idx) => {
        const match = data.find((d) => {
          const dKey = d.month || `${d.date_from} - ${d.date_to}`;
          return dKey === key && d.article_name === name;
        });
        row[truncated[idx]] = match?.total_revenue || 0;
      });
      return row;
    });

    return { chartData: pivoted, articleNames: truncated };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">Tendencia Top 5 Artigos</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de tendencia para o periodo selecionado
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Top 5 Artigos por Mes
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {articleNames.map((name, idx) => (
            <Bar
              key={name}
              dataKey={name}
              fill={ARTICLE_TREND_COLORS[idx % ARTICLE_TREND_COLORS.length]}
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
