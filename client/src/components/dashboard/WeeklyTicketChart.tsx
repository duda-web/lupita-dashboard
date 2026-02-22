import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { STORE_COLORS, STORE_NAMES } from '@/lib/constants';
import { formatCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { UserCheck } from 'lucide-react';

interface DataPoint {
  week: string;
  week_start: string;
  store_id: string;
  total_revenue: number;
  total_tickets: number;
  total_customers: number;
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

export function WeeklyTicketChart({ data }: Props) {
  const weekMap = new Map<string, any>();
  const weekTotals = new Map<string, { revenue: number; customers: number }>();

  for (const d of data) {
    if (!weekMap.has(d.week)) {
      weekMap.set(d.week, { week: d.week_start?.slice(5) || d.week });
      weekTotals.set(d.week, { revenue: 0, customers: 0 });
    }
    const entry = weekMap.get(d.week)!;
    const storeName = STORE_NAMES[d.store_id] || d.store_id;
    entry[storeName] = d.total_customers > 0 ? d.total_revenue / d.total_customers : 0;

    const totals = weekTotals.get(d.week)!;
    totals.revenue += d.total_revenue;
    totals.customers += d.total_customers;
  }

  const chartData = Array.from(weekMap.entries()).map(([week, entry]) => {
    const totals = weekTotals.get(week)!;
    return { ...entry, Total: totals.customers > 0 ? totals.revenue / totals.customers : 0 };
  });

  const storeIds = [...new Set(data.map((d) => d.store_id))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.35 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Evolução do VM Pessoa Semanal</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)} €`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
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
            />
          ))}
          <Line type="monotone" dataKey="Total" stroke={STORE_COLORS.total} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
