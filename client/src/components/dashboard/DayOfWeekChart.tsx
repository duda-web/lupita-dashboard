import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { STORE_COLORS, STORE_NAMES, DAY_ORDER } from '@/lib/constants';
import { formatCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';

interface DataPoint {
  day_of_week: string;
  store_id: string;
  avg_revenue: number | null;
  days_open: number;
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
          <span className="font-medium text-foreground">
            {entry.value ? formatCurrency(entry.value) : 'Fechada'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DayOfWeekChart({ data }: Props) {
  const dayMap = new Map<string, any>();

  for (const day of DAY_ORDER) {
    dayMap.set(day, { day });
  }

  for (const d of data) {
    const entry = dayMap.get(d.day_of_week);
    if (entry) {
      const storeName = STORE_NAMES[d.store_id] || d.store_id;
      entry[storeName] = d.avg_revenue || 0;
    }
  }

  const chartData = Array.from(dayMap.values());
  const storeIds = [...new Set(data.map((d) => d.store_id))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Faturação Média por Dia da Semana</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis type="category" dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={70} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {storeIds.map((sid) => (
            <Bar
              key={sid}
              dataKey={STORE_NAMES[sid] || sid}
              fill={STORE_COLORS[sid] || '#8b5cf6'}
              radius={[0, 4, 4, 0]}
              barSize={12}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
