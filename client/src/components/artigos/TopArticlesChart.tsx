import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { ArticleDataPoint } from '@/types';
import { formatCurrency, formatInteger } from '@/lib/formatters';

type Metric = 'revenue' | 'quantity';

interface Props {
  data: ArticleDataPoint[];
  metric?: Metric;
}

const METRIC_CONFIG: Record<Metric, {
  dataKey: string;
  title: string;
  emptyTitle: string;
  formatter: (v: number) => string;
  tickFormatter: (v: number) => string;
  colors: [string, string, string]; // gold, bright, light
}> = {
  revenue: {
    dataKey: 'total_revenue',
    title: 'Faturacao',
    emptyTitle: 'Top Produtos por Faturacao',
    formatter: formatCurrency,
    tickFormatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`,
    colors: ['#f59e0b', '#fbbf24', '#fcd34d'],
  },
  quantity: {
    dataKey: 'total_qty',
    title: 'Quantidade',
    emptyTitle: 'Top Produtos por Quantidade',
    formatter: formatInteger,
    tickFormatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`,
    colors: ['#3b82f6', '#60a5fa', '#93c5fd'],
  },
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{d.article_name}</p>
      <p className="text-xs text-muted-foreground mb-2">{d.family}{d.subfamily ? ` / ${d.subfamily}` : ''}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Faturacao:</span>
          <span className="font-medium text-foreground">{formatCurrency(d.total_revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Quantidade:</span>
          <span className="font-medium text-foreground">{formatInteger(d.total_qty)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Liquido:</span>
          <span className="font-medium text-foreground">{formatCurrency(d.total_net)}</span>
        </div>
      </div>
    </div>
  );
}

function BarLabel({ x, y, width, height, value, index, data: chartItems, metric: m }: any) {
  if (!chartItems || index == null) return null;
  const item = chartItems[index];
  if (!item) return null;

  const rev = formatCurrency(item.total_revenue);
  const qty = formatInteger(item.total_qty);

  // Position label to the right of the bar
  const labelX = (x || 0) + (width || 0) + 6;
  const labelY = (y || 0) + (height || 0) / 2;

  // Show primary metric first (bold), secondary second
  const primary = m === 'quantity'
    ? { text: `${qty} un`, bold: true }
    : { text: rev, bold: true };
  const secondary = m === 'quantity'
    ? { text: rev, bold: false }
    : { text: `${qty} un`, bold: false };

  return (
    <text x={labelX} y={labelY} textAnchor="start" dominantBaseline="central" fontSize={10}>
      <tspan fill="hsl(var(--foreground))" fontWeight={primary.bold ? 600 : 400}>
        {primary.text}
      </tspan>
      <tspan fill="hsl(var(--muted-foreground))"> · </tspan>
      <tspan fill="hsl(var(--foreground))" fontWeight={secondary.bold ? 600 : 400}>
        {secondary.text}
      </tspan>
    </text>
  );
}

export function TopArticlesChart({ data, metric = 'revenue' }: Props) {
  const config = METRIC_CONFIG[metric];

  const chartData = useMemo(() => {
    // Sort by the selected metric
    const sorted = [...data].sort((a, b) => {
      const aVal = metric === 'quantity' ? a.total_qty : a.total_revenue;
      const bVal = metric === 'quantity' ? b.total_qty : b.total_revenue;
      return bVal - aVal;
    }).slice(0, 15);

    // Detect duplicate article names to disambiguate with family
    const nameCount = new Map<string, number>();
    sorted.forEach((d) => nameCount.set(d.article_name, (nameCount.get(d.article_name) || 0) + 1));

    return sorted.map((d) => {
      let label = d.article_name;
      if ((nameCount.get(d.article_name) || 0) > 1) {
        label = `${d.article_name} (${d.family})`;
      }
      return {
        ...d,
        shortName: label.length > 35 ? label.slice(0, 33) + '...' : label,
      };
    });
  }, [data, metric]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">{config.emptyTitle}</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de artigos para o periodo selecionado
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
        <Trophy className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">
          Top {chartData.length} Produtos por {config.title}
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32 + 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 140, bottom: 0, left: 10 }}
          accessibilityLayer={false}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={config.tickFormatter}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            width={180}
            tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
          <Bar dataKey={config.dataKey} radius={[0, 4, 4, 0]} barSize={22}>
            {chartData.map((_, idx) => (
              <Cell
                key={idx}
                fill={idx === 0 ? config.colors[0] : idx < 3 ? config.colors[1] : config.colors[2]}
                fillOpacity={1 - (idx * 0.03)}
              />
            ))}
            <LabelList
              content={(props: any) => (
                <BarLabel {...props} data={chartData} metric={metric} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
