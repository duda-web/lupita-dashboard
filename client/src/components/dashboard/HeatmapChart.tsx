import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters';
import { DAY_ORDER } from '@/lib/constants';

interface DataPoint {
  date: string;
  day_of_week: string;
  total_revenue: number;
}

interface Props {
  data: DataPoint[];
}

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Multi-hue color palette for heatmap — from cool mint/teal (low) through
 * warm amber/orange to deep red (high). Each level has a distinct hue for
 * maximum contrast between adjacent tiers.
 *
 * Percentile-based thresholds avoid a single outlier washing out all colors.
 */
const HEATMAP_COLORS = [
  '#d1fae5', // p0–p10   — very light emerald/mint
  '#a7f3d0', // p10–p25  — light green
  '#6ee7b7', // p25–p40  — green
  '#fde68a', // p40–p55  — warm yellow
  '#fbbf24', // p55–p70  — amber/gold
  '#f59e0b', // p70–p85  — deep amber
  '#f97316', // p85–p95  — orange
  '#ef4444', // p95+     — red (top performers)
];

function getColor(value: number, thresholds: number[]): string {
  if (value === 0) return 'hsl(var(--muted))';
  // thresholds: [p10, p25, p40, p55, p70, p85, p95]  — 7 breakpoints, 8 levels
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return HEATMAP_COLORS[i];
  }
  return HEATMAP_COLORS[HEATMAP_COLORS.length - 1]; // top bucket
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

function formatDatePT(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

interface TooltipState {
  x: number;
  y: number;
  date: string;
  day: string;
  revenue: number;
}

export function HeatmapChart({ data }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { cells, maxRevenue, weeks, thresholds } = useMemo(() => {
    let max = 0;
    const weekSet = new Set<number>();
    const allValues: number[] = [];
    const cells = data.map((d) => {
      const week = getWeekNumber(d.date);
      weekSet.add(week);
      if (d.total_revenue > max) max = d.total_revenue;
      allValues.push(d.total_revenue);
      const dayIndex = DAY_ORDER.indexOf(d.day_of_week);
      return {
        x: week,
        y: dayIndex >= 0 ? dayIndex : 0,
        z: d.total_revenue,
        date: d.date,
        day: d.day_of_week,
      };
    });
    const thresholds = computeThresholds(allValues);
    return { cells, maxRevenue: max, weeks: Array.from(weekSet).sort((a, b) => a - b), thresholds };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Sem dados para o heatmap</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm relative"
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">Heatmap Semanal</h3>
      <p className="text-[10px] text-muted-foreground mb-3">Faturação diária por semana ISO (números no topo = nº da semana)</p>
      <div className="overflow-x-auto">
        <div className="grid gap-0.5" style={{ minWidth: weeks.length * 20 }}>
          {/* Week number headers */}
          <div className="flex gap-0.5 mb-1">
            <div className="w-12" />
            {weeks.map((w) => (
              <div key={w} className="w-5 text-center text-[8px] text-muted-foreground font-mono">
                S{w}
              </div>
            ))}
          </div>
          {DAY_ORDER.map((day, dayIdx) => (
            <div key={day} className="flex gap-0.5 items-center">
              <div className="w-12 text-right pr-2 text-[10px] text-muted-foreground">
                {day.slice(0, 3)}
              </div>
              {weeks.map((week) => {
                const cell = cells.find((c) => c.x === week && c.y === dayIdx);
                const revenue = cell?.z || 0;
                return (
                  <div
                    key={week}
                    className="w-5 h-5 rounded-sm cursor-pointer transition-transform hover:scale-125 relative"
                    style={{ backgroundColor: getColor(revenue, thresholds) }}
                    onMouseEnter={(e) => {
                      if (cell) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                          date: cell.date,
                          day: cell.day,
                          revenue: cell.z,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend — multi-hue color scale */}
        <div className="flex gap-0.5 mt-3 items-start">
          <div className="w-12" />
          <div className="flex items-center gap-0">
            {[
              { color: 'hsl(var(--muted))', label: '0' },
              { color: HEATMAP_COLORS[0], label: formatCompactCurrency(thresholds[0]) },
              { color: HEATMAP_COLORS[2], label: formatCompactCurrency(thresholds[2]) },
              { color: HEATMAP_COLORS[4], label: formatCompactCurrency(thresholds[4]) },
              { color: HEATMAP_COLORS[6], label: formatCompactCurrency(thresholds[6]) },
              { color: HEATMAP_COLORS[7], label: formatCompactCurrency(maxRevenue) },
            ].map((step, i, arr) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="w-8 h-3"
                  style={{
                    backgroundColor: step.color,
                    borderRadius: i === 0 ? '3px 0 0 3px' : i === arr.length - 1 ? '0 3px 3px 0' : '0',
                  }}
                />
                <span className="text-[9px] text-muted-foreground mt-0.5">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom tooltip - fixed position above cursor */}
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
              {formatDatePT(tooltip.date)} · {tooltip.day}
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
