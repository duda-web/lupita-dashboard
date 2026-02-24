import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { STORE_COLORS, STORE_NAMES } from '@/lib/constants';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';

interface DataPoint {
  week: string;
  week_start: string;
  store_id: string;
  total_revenue: number;
}

interface Props {
  data: DataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
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

export function WeeklyRevenueChart({ data }: Props) {
  // Group by week, create columns per store + total
  const weekMap = new Map<string, any>();
  for (const d of data) {
    if (!weekMap.has(d.week)) {
      weekMap.set(d.week, { week: d.week_start?.slice(5) || d.week, total: 0 });
    }
    const entry = weekMap.get(d.week)!;
    const storeName = STORE_NAMES[d.store_id] || d.store_id;
    entry[storeName] = (entry[storeName] || 0) + d.total_revenue;
    entry.total += d.total_revenue;
  }

  const chartData = Array.from(weekMap.values());
  const storeIds = [...new Set(data.map((d) => d.store_id))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Evolução Semanal da Faturação</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {storeIds.map((sid) => (
            <Line
              key={sid}
              type="monotone"
              dataKey={STORE_NAMES[sid] || sid}
              stroke={STORE_COLORS[sid] || '#8b5cf6'}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke={STORE_COLORS.total}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
