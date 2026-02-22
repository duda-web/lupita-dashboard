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
import { ArrowLeftRight } from 'lucide-react';
import type { ArticleByStoreDataPoint } from '@/types';
import { STORE_NAMES, STORE_COLORS } from '@/lib/constants';
import { formatCurrency, formatInteger } from '@/lib/formatters';

interface Props {
  data: ArticleByStoreDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function StoreComparisonChart({ data }: Props) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Get unique article names preserving order from API (which is by total revenue)
    const articleNames = [...new Set(data.map((d) => d.article_name))];

    // Get unique stores
    const storeIds = [...new Set(data.map((d) => d.store_id))];

    // Pivot: one row per article, columns per store
    return articleNames.map((name) => {
      const row: any = {
        name: name.length > 30 ? name.slice(0, 28) + '...' : name,
        fullName: name,
      };
      storeIds.forEach((storeId) => {
        const match = data.find((d) => d.article_name === name && d.store_id === storeId);
        row[storeId] = match?.total_revenue || 0;
        row[`${storeId}_qty`] = match?.total_qty || 0;
      });
      return row;
    });
  }, [data]);

  const storeIds = useMemo(() => [...new Set(data.map((d) => d.store_id))], [data]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Comparacao entre Lojas</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados para comparar entre lojas
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">
          Top 10 Artigos — Comparacao entre Lojas
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40 + 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {storeIds.map((storeId) => (
            <Bar
              key={storeId}
              dataKey={storeId}
              name={STORE_NAMES[storeId] || storeId}
              fill={STORE_COLORS[storeId] || '#6b7280'}
              radius={[0, 4, 4, 0]}
              barSize={14}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
