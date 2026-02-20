import { motion } from 'framer-motion';
import { formatCurrency, formatPercentage, formatInteger } from '@/lib/formatters';
import { STORE_NAMES, STORE_COLORS } from '@/lib/constants';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StoreCardProps {
  storeId: string;
  revenue: number;
  mix: number;
  variation: number | null;
  target: number;
  customers: number;
  avgPerCustomer: number;
  delay?: number;
  comparisonLabel?: string;
}

export function StoreCard({
  storeId,
  revenue,
  mix,
  variation,
  target,
  customers,
  avgPerCustomer,
  delay = 0,
  comparisonLabel,
}: StoreCardProps) {
  const isPositive = variation !== null && variation > 0;
  const isNegative = variation !== null && variation < 0;
  const color = STORE_COLORS[storeId] || '#8b5cf6';

  const targetVariation = target > 0 ? ((revenue - target) / target) * 100 : null;
  const isTargetPositive = targetVariation !== null && targetVariation >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {STORE_NAMES[storeId] || storeId}
        </p>
      </div>
      <p className="text-xl font-bold text-foreground mb-1">{formatCurrency(revenue)}</p>

      {/* Variation row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {mix.toFixed(1).replace('.', ',')}% do total
        </span>
        {variation !== null && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              isPositive ? 'text-lupita-green' : isNegative ? 'text-lupita-red' : 'text-muted-foreground'
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : null}
            {formatPercentage(variation)}
            {comparisonLabel && (
              <span className="text-[10px] text-muted-foreground font-normal">{comparisonLabel}</span>
            )}
          </span>
        )}
      </div>

      {/* Extra metrics */}
      <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>vs Objectivo</span>
          <span className="flex items-center gap-1">
            <span className="text-foreground">{formatCurrency(target)}</span>
            {targetVariation !== null && (
              <span className={isTargetPositive ? 'text-lupita-green font-medium' : 'text-lupita-red font-medium'}>
                {formatPercentage(targetVariation)}
              </span>
            )}
          </span>
        </div>
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
