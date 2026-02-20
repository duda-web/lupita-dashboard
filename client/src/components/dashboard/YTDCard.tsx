import { motion } from 'framer-motion';
import { formatCurrency, formatPercentage, formatInteger } from '@/lib/formatters';

interface YTDCardProps {
  current: number;
  previousYear: number;
  variation: number | null;
  customers: number;
  avgPerCustomer: number;
  yearLabel?: string;
}

export function YTDCard({ current, previousYear, variation, customers, avgPerCustomer, yearLabel }: YTDCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        YTD (Ano em curso)
      </p>
      {yearLabel && (
        <p className="text-[11px] text-muted-foreground mb-2">{yearLabel}</p>
      )}
      <p className="text-2xl font-bold text-foreground mb-2">{formatCurrency(current)}</p>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Ano anterior (mesmo período)</span>
          <span>{formatCurrency(previousYear)}</span>
        </div>
        {variation !== null && (
          <div className="flex justify-between">
            <span>Variação</span>
            <span className={variation >= 0 ? 'text-lupita-green font-medium' : 'text-lupita-red font-medium'}>
              {formatPercentage(variation)}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span>VM Pessoa</span>
          <span className="text-foreground">{formatCurrency(avgPerCustomer)}</span>
        </div>
        <div className="flex justify-between">
          <span>Clientes</span>
          <span className="text-foreground">{formatInteger(customers)}</span>
        </div>
      </div>
    </motion.div>
  );
}
