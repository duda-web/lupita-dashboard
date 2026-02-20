import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ABCArticle } from '@/types';
import { ABC_MATRIX_LABELS } from '@/types';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';

interface Props {
  data: ABCArticle[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const meta = ABC_MATRIX_LABELS[d.abc_class];
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{d.fullName}</p>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Faturação:</span>
          <span className="font-medium text-foreground">{formatCurrency(d.total_value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Peso:</span>
          <span className="font-medium text-foreground">{(d.value_pct * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Acumulado:</span>
          <span className="font-medium text-foreground">{(d.cumulative_pct * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Classe:</span>
          <span className="font-semibold" style={{ color: meta?.color || '#666' }}>
            {d.abc_class} {meta ? `— ${meta.labelShort}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ABCParetoChart({ data }: Props) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      name: d.article_name.length > 16 ? d.article_name.slice(0, 14) + '…' : d.article_name,
      fullName: d.article_name,
      total_value: d.total_value,
      value_pct: d.value_pct,
      cumulative_pct: d.cumulative_pct,
      cumulative_line: d.cumulative_pct * 100,
      abc_class: d.abc_class,
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Curva de Pareto</h3>
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">Curva de Pareto — Top 30</h3>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 40, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="right" y={70} stroke="#10b981" strokeDasharray="5 5" label={{ value: '70% (A)', fill: '#10b981', fontSize: 10, position: 'right' }} />
          <ReferenceLine yAxisId="right" y={90} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: '90% (B)', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
          <Bar yAxisId="left" dataKey="total_value" radius={[2, 2, 0, 0]} barSize={16}>
            {chartData.map((d, idx) => {
              const meta = ABC_MATRIX_LABELS[d.abc_class];
              return (
                <Cell key={idx} fill={meta?.color || '#6b7280'} fillOpacity={0.85} />
              );
            })}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative_line"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
