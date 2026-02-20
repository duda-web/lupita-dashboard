import { motion } from 'framer-motion';
import type { ABCDistributionResponse, ABCConcentration } from '@/types';
import { formatCurrency, formatInteger } from '@/lib/formatters';

const STRATEGIC_GROUPS = [
  {
    label: 'Estrelas',
    classes: ['AA'],
    color: '#10b981',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30',
  },
  {
    label: 'Premium',
    classes: ['AB', 'AC'],
    color: '#6366f1',
    bg: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/30',
  },
  {
    label: 'Popular Barato',
    classes: ['BA', 'CA'],
    color: '#f59e0b',
    bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30',
  },
  {
    label: 'Core / Mid',
    classes: ['BB', 'BC', 'CB'],
    color: '#3b82f6',
    bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/30',
  },
  {
    label: 'Risco / Sair',
    classes: ['CC'],
    color: '#ef4444',
    bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30',
  },
];

interface Props {
  distribution: ABCDistributionResponse | null;
  concentration: ABCConcentration | null;
}

export function ABCKPICards({ distribution, concentration }: Props) {
  const matrixData = distribution?.matrix || [];

  const cards = STRATEGIC_GROUPS.map((group) => {
    const items = matrixData.filter((d) => group.classes.includes(d.class));
    const count = items.reduce((s, d) => s + d.count, 0);
    const revPct = items.reduce((s, d) => s + d.revenue_pct, 0);
    return {
      label: group.label,
      value: count as number | string,
      sub: `${revPct.toFixed(1)}% faturação`,
      color: group.color,
      bg: group.bg,
    };
  });

  cards.push({
    label: 'Top 10',
    value: `${concentration?.top10_pct.toFixed(1) || 0}%`,
    sub: formatCurrency(concentration?.top10_value || 0),
    color: '#8b5cf6',
    bg: 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/30',
  });

  cards.push({
    label: 'Total Artigos',
    value: concentration?.total_articles || 0,
    sub: formatCurrency(concentration?.total_value || 0),
    color: '#64748b',
    bg: 'bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-900/30',
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((card, idx) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
          className={`rounded-xl border p-3 ${card.bg}`}
        >
          <p className="text-[11px] font-medium text-muted-foreground mb-1 truncate">{card.label}</p>
          <p className="text-xl font-bold" style={{ color: card.color }}>
            {typeof card.value === 'number' ? formatInteger(card.value) : card.value}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{card.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}
