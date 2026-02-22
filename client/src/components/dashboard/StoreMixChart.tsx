import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { STORE_COLORS, STORE_NAMES } from '@/lib/constants';
import { formatCurrency, formatPercentage } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';

interface Props {
  stores: Array<{
    store_id: string;
    revenue: number;
    mix: number;
  }>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{formatCurrency(data.value)}</p>
      <p className="text-xs text-muted-foreground">{data.mix.toFixed(1).replace('.', ',')}%</p>
    </div>
  );
}

export function StoreMixChart({ stores }: Props) {
  const chartData = stores.map((s) => ({
    name: STORE_NAMES[s.store_id] || s.store_id,
    value: s.revenue,
    mix: s.mix,
    color: STORE_COLORS[s.store_id] || '#8b5cf6',
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Mix por Unidade</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={0}
            dataKey="value"
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-2">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">
              {entry.name} ({entry.mix.toFixed(1).replace('.', ',')}%)
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
