import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatInteger, formatPercentage } from '@/lib/formatters';

interface KPICardProps {
  title: string;
  value: number;
  previousValue?: number;
  variation?: number | null;
  format?: 'currency' | 'integer' | 'decimal';
  delay?: number;
  comparisonLabel?: string;
  icon?: LucideIcon;
  iconColor?: string;
}

export function KPICard({
  title,
  value,
  previousValue,
  variation,
  format = 'currency',
  delay = 0,
  comparisonLabel,
  icon: Icon,
  iconColor = 'text-lupita-amber',
}: KPICardProps) {
  const formattedValue =
    format === 'currency'
      ? formatCurrency(value)
      : format === 'integer'
      ? formatInteger(value)
      : value.toFixed(2).replace('.', ',') + ' \u20ac';

  const isPositive = variation !== null && variation !== undefined && variation > 0;
  const isNegative = variation !== null && variation !== undefined && variation < 0;
  const isNeutral = variation === null || variation === undefined || variation === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className={`h-3.5 w-3.5 ${iconColor}`} />}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{formattedValue}</p>
      {variation !== undefined && variation !== null && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {isPositive && <TrendingUp className="h-3.5 w-3.5 text-lupita-green" />}
          {isNegative && <TrendingDown className="h-3.5 w-3.5 text-lupita-red" />}
          {isNeutral && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
          <span
            className={`text-sm font-medium ${
              isPositive ? 'text-lupita-green' : isNegative ? 'text-lupita-red' : 'text-muted-foreground'
            }`}
          >
            {formatPercentage(variation)}
          </span>
          {comparisonLabel && (
            <span className="text-[10px] text-muted-foreground">{comparisonLabel}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
