import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { CategoryMixDataPoint } from '@/types';
import { FAMILY_COLOR_PALETTE } from '@/lib/constants';
import { formatCurrency, formatInteger } from '@/lib/formatters';

interface Props {
  data: CategoryMixDataPoint[];
}

// Exclude non-product categories
const EXCLUDE_CATEGORIES = ['TAXA', 'VOUCHERS', 'INATIVOS', 'MERCHANDISING', ''];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const pct = d.total_revenue > 0 && d._total > 0
    ? ((d.total_revenue / d._total) * 100).toFixed(1)
    : '0';
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1">{d.category}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Faturacao:</span>
          <span className="font-medium text-foreground">{formatCurrency(d.total_revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Quantidade:</span>
          <span className="font-medium text-foreground">{formatInteger(d.total_qty)} un</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Artigos:</span>
          <span className="font-medium text-foreground">{d.article_count}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Peso:</span>
          <span className="font-medium text-foreground">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#fff">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function CategoryMixChart({ data }: Props) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    const filtered = data.filter(
      (d) => !EXCLUDE_CATEGORIES.includes(d.category) && d.total_revenue > 0
    );

    const total = filtered.reduce((sum, d) => sum + d.total_revenue, 0);

    // Add total for tooltip percentage calc
    return filtered.map((d) => ({ ...d, _total: total }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <PieChartIcon className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Mix por Categoria</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de categorias para o periodo selecionado
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
        <PieChartIcon className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Mix por Categoria</h3>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={chartData}
            dataKey="total_revenue"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={2}
            label={renderCustomLabel}
            labelLine={false}
          >
            {chartData.map((_, idx) => (
              <Cell
                key={idx}
                fill={FAMILY_COLOR_PALETTE[idx % FAMILY_COLOR_PALETTE.length]}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
