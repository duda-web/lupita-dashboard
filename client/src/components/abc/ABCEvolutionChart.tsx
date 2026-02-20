import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ABCEvolutionPoint } from '@/types';
import { ARTICLE_TREND_COLORS } from '@/lib/constants';

interface Props {
  data: ABCEvolutionPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium text-foreground">#{Math.round(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ABCEvolutionChart({ data }: Props) {
  const { chartData, articles } = useMemo(() => {
    if (data.length === 0) return { chartData: [], articles: [] };

    // Get unique article names and weeks
    const articleSet = new Set(data.map((d) => d.article_name));
    const articles = Array.from(articleSet);
    const weekMap = new Map<string, any>();

    for (const d of data) {
      if (!weekMap.has(d.week)) {
        weekMap.set(d.week, { week: d.week, week_start: d.week_start });
      }
      const row = weekMap.get(d.week);
      row[d.article_name] = d.avg_ranking;
    }

    const chartData = Array.from(weekMap.values()).sort((a, b) =>
      a.week.localeCompare(b.week)
    );

    // Convert week labels to more readable format
    for (const row of chartData) {
      if (row.week_start) {
        const d = new Date(row.week_start + 'T00:00:00');
        const day = d.getDate();
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        row.label = `${day} ${months[d.getMonth()]}`;
      }
    }

    return { chartData, articles };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Evolução Ranking — Top 10</h3>
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados de evolução</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.35 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Evolução Ranking — Top 10
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            reversed
            domain={[1, 'auto']}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'Posição', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            iconType="line"
            iconSize={10}
          />
          {articles.map((name, idx) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name.length > 20 ? name.slice(0, 18) + '…' : name}
              stroke={ARTICLE_TREND_COLORS[idx % ARTICLE_TREND_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
