import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';

interface DataPoint {
  week: string;
  week_start: string;
  store_id: string;
  total_revenue: number;
  total_target: number;
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

export function TargetChart({ data }: Props) {
  // Aggregate by week
  const weekMap = new Map<string, { week: string; real: number; objectivo: number }>();

  for (const d of data) {
    if (!weekMap.has(d.week)) {
      weekMap.set(d.week, { week: d.week_start?.slice(5) || d.week, real: 0, objectivo: 0 });
    }
    const entry = weekMap.get(d.week)!;
    entry.real += d.total_revenue;
    entry.objectivo += d.total_target;
  }

  const chartData = Array.from(weekMap.values());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.55 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">Real vs Objectivo</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area type="monotone" dataKey="real" name="Real" stroke="#10b981" fill="#10b98133" strokeWidth={2} />
          <Area type="monotone" dataKey="objectivo" name="Objectivo" stroke="#f59e0b" fill="#f59e0b22" strokeWidth={2} strokeDasharray="5 5" />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
