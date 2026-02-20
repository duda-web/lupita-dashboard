import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ABCStoreComparisonPoint } from '@/types';
import { STORE_NAMES, STORE_COLORS } from '@/lib/constants';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';

interface Props {
  data: ABCStoreComparisonPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
              <span className="text-muted-foreground text-xs">{p.name}</span>
            </div>
            <span className="font-medium text-foreground text-xs">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ABCStoreComparison({ data }: Props) {
  const { chartData, stores } = useMemo(() => {
    if (data.length === 0) return { chartData: [], stores: [] };

    const storeSet = new Set(data.map((d) => d.store_id));
    const stores = Array.from(storeSet);

    // Pivot data: one row per article, columns per store
    const articleMap = new Map<string, any>();
    for (const d of data) {
      if (!articleMap.has(d.article_name)) {
        articleMap.set(d.article_name, {
          article_name: d.article_name,
          _total: 0,
        });
      }
      const row = articleMap.get(d.article_name);
      row[d.store_id] = d.total_value;
      row._total += d.total_value;
    }

    const chartData = Array.from(articleMap.values())
      .sort((a, b) => b._total - a._total);

    return { chartData, stores };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Comparação entre Lojas — Top 15</h3>
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
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
        Comparação entre Lojas — Top 15
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
          />
          <YAxis
            type="category"
            dataKey="article_name"
            width={130}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + '…' : v}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="square"
            iconSize={8}
          />
          {stores.map((storeId) => (
            <Bar
              key={storeId}
              dataKey={storeId}
              name={STORE_NAMES[storeId] || storeId}
              fill={STORE_COLORS[storeId] || '#6b7280'}
              barSize={10}
              radius={[0, 3, 3, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
