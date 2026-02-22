import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ZONE_COLORS, ZONE_NAMES } from '@/lib/constants';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import type { ZoneTrendDataPoint } from '@/types';
import { useMemo } from 'react';

interface Props {
  data: ZoneTrendDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ZoneTrendChart({ data }: Props) {
  const { chartData, zoneList } = useMemo(() => {
    // Pivot: group by week, create columns per zone
    const weekMap = new Map<string, Record<string, any>>();
    const zones = new Set<string>();

    for (const d of data) {
      zones.add(d.zone);
      if (!weekMap.has(d.week)) {
        // Format week_start as DD/MM for x-axis label
        const weekLabel = d.week_start
          ? `${d.week_start.slice(8, 10)}/${d.week_start.slice(5, 7)}`
          : d.week;
        weekMap.set(d.week, { week: weekLabel });
      }
      const entry = weekMap.get(d.week)!;
      const zoneName = ZONE_NAMES[d.zone] || d.zone;
      entry[zoneName] = (entry[zoneName] || 0) + d.total_revenue;
    }

    return {
      chartData: Array.from(weekMap.values()),
      zoneList: Array.from(zones),
    };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Tendência Semanal por Zona</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de zonas para o periodo selecionado
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.55 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Tendência Semanal por Zona</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            tickFormatter={(v) => formatCompactCurrency(v)}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
          />
          {zoneList.map((zone) => {
            const zoneName = ZONE_NAMES[zone] || zone;
            return (
              <Area
                key={zone}
                type="monotone"
                dataKey={zoneName}
                stackId="1"
                stroke={ZONE_COLORS[zone] || '#6b7280'}
                fill={ZONE_COLORS[zone] || '#6b7280'}
                fillOpacity={0.6}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
