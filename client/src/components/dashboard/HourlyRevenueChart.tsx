import { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { fetchChartData } from '@/lib/api';
import { motion } from 'framer-motion';
import type { HourlySlotData } from '@/types';

interface Props {
  /** Base data (dayType=all) used when no dayType filter active */
  data: HourlySlotData[];
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  zone?: string;
  /** Persistent Y-axis max passed from parent (survives component unmount/remount) */
  yMax?: number;
}

type DayType = 'all' | 'weekday' | 'weekend';

const DAY_TYPE_LABELS: Record<DayType, string> = {
  all: 'Todos',
  weekday: 'Dias Úteis',
  weekend: 'Fim de Semana',
};

/** Color gradient from cool (low) → warm amber (peak) → cool again (late) */
function barColor(avgRevenue: number, maxRevenue: number): string {
  if (maxRevenue === 0) return '#d1d5db';
  const ratio = avgRevenue / maxRevenue;
  if (ratio >= 0.85) return '#f59e0b'; // amber — peak
  if (ratio >= 0.65) return '#fbbf24'; // amber-400
  if (ratio >= 0.45) return '#fcd34d'; // amber-300
  if (ratio >= 0.25) return '#fde68a'; // amber-200
  return '#fef3c7';                    // amber-100
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as HourlySlotData;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Fat. media/dia</span>
          <span className="font-semibold text-foreground">{formatCurrency(d.avg_revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Fat. total</span>
          <span className="font-medium text-foreground">{formatCurrency(d.total_revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Tickets total</span>
          <span className="font-medium text-foreground">{d.num_tickets}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Dias</span>
          <span className="font-medium text-foreground">{d.days}</span>
        </div>
      </div>
    </div>
  );
}

export function HourlyRevenueChart({ data: baseData, dateFrom, dateTo, storeId, zone, yMax = 0 }: Props) {
  const [dayType, setDayType] = useState<DayType>('all');
  const [filteredData, setFilteredData] = useState<HourlySlotData[] | null>(null);

  // Fetch filtered data when dayType changes
  useEffect(() => {
    if (dayType === 'all') {
      setFilteredData(null); // use baseData
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchChartData('hourly_revenue', {
          dateFrom, dateTo, storeId, zone,
          dayType,
        });
        if (!cancelled) setFilteredData(result as unknown as HourlySlotData[]);
      } catch {
        if (!cancelled) setFilteredData(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dayType, dateFrom, dateTo, storeId, zone]);

  const data = filteredData ?? baseData;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Sem dados horarios</p>
      </div>
    );
  }

  // Unified scale: combine parent-level persistent max (yMax) with local dayType tracking
  const highestMaxRef = useRef(0);
  const baseMax = Math.max(...baseData.map((d) => d.avg_revenue), 0);
  const currentMax = Math.max(...data.map((d) => d.avg_revenue), 0);
  highestMaxRef.current = Math.max(highestMaxRef.current, baseMax, currentMax, yMax);
  const globalMax = highestMaxRef.current;

  const chartData = data.map((d) => ({
    ...d,
    fill: barColor(d.avg_revenue, globalMax),
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      {/* Header with dayType filter */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart3 className="h-4 w-4 text-lupita-amber" />
            <h3 className="text-sm font-semibold text-foreground">Faturação Média/Slot</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">Média diária de faturação por slot horário (30 min)</p>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'weekday', 'weekend'] as DayType[]).map((dt) => (
            <button
              key={dt}
              onClick={() => setDayType(dt)}
              className={`px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors ${
                dayType === dt
                  ? 'bg-lupita-amber text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {DAY_TYPE_LABELS[dt]}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="time_slot"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            interval={1}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            domain={[0, Math.ceil(globalMax / 200) * 200]}
            ticks={Array.from({ length: Math.ceil(globalMax / 200) + 1 }, (_, i) => i * 200)}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k €` : `${v} €`}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
          <Bar
            dataKey="avg_revenue"
            radius={[3, 3, 0, 0]}
            isAnimationActive={true}
            animationDuration={800}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
