import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';

interface DataPoint {
  month: string;
  store_id: string;
  total_revenue: number;
}

interface Props {
  currentYearData: DataPoint[];
  previousYearData: DataPoint[];
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

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function MonthlyComparisonChart({ currentYearData, previousYearData }: Props) {
  // Aggregate by month
  const monthlyMap = new Map<string, { month: string; current: number; previous: number }>();

  for (let i = 0; i < 12; i++) {
    const key = String(i + 1).padStart(2, '0');
    monthlyMap.set(key, { month: MONTH_NAMES[i], current: 0, previous: 0 });
  }

  for (const d of currentYearData) {
    const monthKey = d.month.split('-')[1];
    const entry = monthlyMap.get(monthKey);
    if (entry) entry.current += d.total_revenue;
  }

  for (const d of previousYearData) {
    const monthKey = d.month.split('-')[1];
    const entry = monthlyMap.get(monthKey);
    if (entry) entry.previous += d.total_revenue;
  }

  const chartData = Array.from(monthlyMap.values()).filter(
    (d) => d.current > 0 || d.previous > 0
  );

  const currentYear = new Date().getFullYear();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.45 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Comparativo Mensal</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="current" name={String(currentYear)} fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
          <Bar dataKey="previous" name={String(currentYear - 1)} fill="#64748b" radius={[4, 4, 0, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
