import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/formatters';

interface MTDCardProps {
  current: number;
  previousMonth: number;
  variationMoM: number | null;
  variationYoY: number | null;
  projection: number;
  progress: number;
  daysElapsed: number;
  daysInMonth: number;
  monthLabel?: string;
}

export function MTDCard({
  current,
  previousMonth,
  variationMoM,
  variationYoY,
  projection,
  progress,
  daysElapsed,
  daysInMonth,
  monthLabel,
}: MTDCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <CalendarDays className="h-3.5 w-3.5 text-lupita-amber" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          MTD (Mês em curso)
        </p>
      </div>
      {monthLabel && (
        <p className="text-[11px] text-muted-foreground mb-2">{monthLabel}</p>
      )}
      <p className="text-2xl font-bold text-foreground mb-2">{formatCurrency(current)}</p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Dia {daysElapsed} de {daysInMonth}</span>
          <span>Projeção: {formatCurrency(projection)}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-lupita-amber rounded-full"
          />
        </div>
      </div>

      <div className="flex gap-4 text-xs">
        {variationMoM !== null && (
          <span className={variationMoM >= 0 ? 'text-lupita-green' : 'text-lupita-red'}>
            vs mês ant.: {formatPercentage(variationMoM)}
          </span>
        )}
        {variationYoY !== null && (
          <span className={variationYoY >= 0 ? 'text-lupita-green' : 'text-lupita-red'}>
            vs ano ant.: {formatPercentage(variationYoY)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
