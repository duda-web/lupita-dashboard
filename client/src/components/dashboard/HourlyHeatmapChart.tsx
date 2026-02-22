import { useMemo, useState, useEffect } from 'react';
import { Grid3x3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { fetchChartData } from '@/lib/api';
import type { HourlyHeatmapData } from '@/types';

interface Props {
  /** Base data (dayType=all) used when no dayType filter active */
  data: HourlyHeatmapData[];
  /** Unfiltered data used ONLY to compute a unified color scale. */
  globalData?: HourlyHeatmapData[];
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  zone?: string;
}

type DayType = 'all' | 'weekday' | 'weekend';

const DAY_TYPE_LABELS: Record<DayType, string> = {
  all: 'Todos',
  weekday: 'Dias Úteis',
  weekend: 'Fim de Semana',
};

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const DAY_ORDER_DISPLAY = [1, 2, 3, 4, 5, 6, 0]; // Seg-Dom (strftime %w: 0=dom)

const HEATMAP_COLORS = [
  '#d1fae5', // p0-p10 — very light emerald/mint
  '#a7f3d0', // p10-p25 — light green
  '#6ee7b7', // p25-p40 — green
  '#fde68a', // p40-p55 — warm yellow
  '#fbbf24', // p55-p70 — amber/gold
  '#f59e0b', // p70-p85 — deep amber
  '#f97316', // p85-p95 — orange
  '#ef4444', // p95+ — red (top performers)
];

function getColor(value: number, thresholds: number[]): string {
  if (value === 0) return 'hsl(var(--muted))';
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return HEATMAP_COLORS[i];
  }
  return HEATMAP_COLORS[HEATMAP_COLORS.length - 1];
}

function computeThresholds(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  const pct = (p: number) => {
    const idx = Math.floor(p * (sorted.length - 1));
    return sorted[idx];
  };
  return [pct(0.10), pct(0.25), pct(0.40), pct(0.55), pct(0.70), pct(0.85), pct(0.95)];
}

interface TooltipState {
  x: number;
  y: number;
  timeSlot: string;
  dayLabel: string;
  revenue: number;
}

export function HourlyHeatmapChart({ data: baseData, globalData, dateFrom, dateTo, storeId, zone }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [dayType, setDayType] = useState<DayType>('all');
  const [filteredData, setFilteredData] = useState<HourlyHeatmapData[] | null>(null);

  // Fetch filtered data when dayType changes
  useEffect(() => {
    if (dayType === 'all') {
      setFilteredData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchChartData('hourly_heatmap', {
          dateFrom, dateTo, storeId, zone,
          dayType,
        });
        if (!cancelled) setFilteredData(result as unknown as HourlyHeatmapData[]);
      } catch {
        if (!cancelled) setFilteredData(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dayType, dateFrom, dateTo, storeId, zone]);

  const data = filteredData ?? baseData;

  // Compute unified thresholds from globalData (unfiltered) so scale stays constant
  const { globalThresholds, globalMax } = useMemo(() => {
    const source = globalData && globalData.length > 0 ? globalData : baseData;
    const values = source.map((d) => d.avg_revenue).filter((v) => v > 0);
    return {
      globalThresholds: computeThresholds(values),
      globalMax: values.length > 0 ? Math.max(...values) : 0,
    };
  }, [globalData, baseData]);

  const { grid, timeSlots } = useMemo(() => {
    const lookup = new Map<string, number>();
    const slotSet = new Set<string>();

    for (const d of data) {
      const key = `${d.day_of_week}-${d.time_slot}`;
      lookup.set(key, d.avg_revenue);
      slotSet.add(d.time_slot);
    }

    if (globalData) {
      for (const d of globalData) {
        slotSet.add(d.time_slot);
      }
    }

    const timeSlots = Array.from(slotSet).sort((a, b) => {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });

    return { grid: lookup, timeSlots };
  }, [data, globalData]);

  // Filter day rows based on dayType
  const visibleDays = dayType === 'weekend'
    ? [6, 0] // Sab, Dom
    : dayType === 'weekday'
    ? [1, 2, 3, 4, 5] // Seg-Sex
    : DAY_ORDER_DISPLAY; // all

  if (baseData.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Sem dados para o heatmap horario</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm relative"
    >
      {/* Header with dayType filter */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Grid3x3 className="h-4 w-4 text-lupita-amber" />
            <h3 className="text-sm font-semibold text-foreground">Heatmap</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">Faturação média por slot horário (30 min) e dia da semana</p>
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

      <div className="overflow-x-auto">
        <div
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `40px repeat(${timeSlots.length}, 1fr)`,
          }}
        >
          {/* Time slot headers */}
          <div /> {/* empty corner */}
          {timeSlots.map((slot) => (
            <div key={slot} className="flex items-end justify-center text-[9px] font-medium text-foreground/70 font-mono pb-1.5" style={{ height: 44 }}>
              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{slot}</span>
            </div>
          ))}
          {/* Day rows */}
          {visibleDays.map((dayNum) => (
            <>
              <div key={`label-${dayNum}`} className="flex items-center justify-end pr-1.5 text-[10px] text-muted-foreground">
                {DAY_LABELS[dayNum]}
              </div>
              {timeSlots.map((slot) => {
                const key = `${dayNum}-${slot}`;
                const revenue = grid.get(key) || 0;
                return (
                  <div
                    key={`${dayNum}-${slot}`}
                    className="aspect-square rounded-sm cursor-pointer transition-transform hover:scale-110"
                    style={{ backgroundColor: getColor(revenue, globalThresholds) }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        timeSlot: slot,
                        dayLabel: DAY_LABELS[dayNum],
                        revenue,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </>
          ))}
        </div>

        {/* Legend */}
        {(() => {
          const steps = [
            { color: 'hsl(var(--muted))', label: '0' },
            { color: HEATMAP_COLORS[0], label: formatCompactCurrency(globalThresholds[0]) },
            { color: HEATMAP_COLORS[2], label: formatCompactCurrency(globalThresholds[2]) },
            { color: HEATMAP_COLORS[4], label: formatCompactCurrency(globalThresholds[4]) },
            { color: HEATMAP_COLORS[6], label: formatCompactCurrency(globalThresholds[6]) },
            { color: HEATMAP_COLORS[7], label: formatCompactCurrency(globalMax) },
          ];
          return (
            <div className="mt-3 ml-10 mr-4">
              <div className="flex">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      height: 10,
                      backgroundColor: step.color,
                      borderRadius: i === 0 ? '3px 0 0 3px' : i === steps.length - 1 ? '0 3px 3px 0' : '0',
                    }}
                  />
                ))}
              </div>
              <div className="flex mt-0.5">
                {steps.map((step, i) => (
                  <span
                    key={i}
                    className="flex-1 text-center text-[9px] text-muted-foreground"
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Custom tooltip */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-xs">
            <p className="text-muted-foreground mb-1">
              {tooltip.dayLabel} · {tooltip.timeSlot}
            </p>
            <p className="font-semibold text-foreground text-sm">
              {formatCurrency(tooltip.revenue)}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
