import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Target, BarChart3, Zap, Calendar } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/formatters';
import type { ProjectionResponse, ProjectionDelta } from '@/types';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface ProjectionCardProps {
  data: ProjectionResponse;
}

function DeltaRow({
  label,
  delta,
}: {
  label: string;
  delta: ProjectionDelta;
}) {
  const isPositive = delta.euros >= 0;
  const colorClass = isPositive ? 'text-lupita-green' : 'text-lupita-red';
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium ${colorClass}`}>
        <Icon className="h-3 w-3" />
        {isPositive ? '+' : ''}{formatCurrency(delta.euros)}
        {delta.pct !== null && (
          <span className="text-[10px]">({formatPercentage(delta.pct)})</span>
        )}
      </span>
    </div>
  );
}

export function ProjectionCard({ data }: ProjectionCardProps) {
  const progressPct = data.target_total > 0
    ? (data.actual / data.target_total) * 100
    : 0;

  const gapDaily = data.required_daily - data.avg_daily;

  // Parse month_label (e.g. "2026-02") to get month name
  const [yearStr, monthStr] = data.month_label.split('-');
  const monthName = MONTH_NAMES_PT[parseInt(monthStr) - 1] || '';
  const monthLabel = `${monthName} ${yearStr}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-lupita-amber" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Projeção Mensal (MTD)
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">
          {monthLabel} · Dia {data.days_elapsed} de {data.days_total}
          {data.days_remaining > 0 && (
            <span className="ml-1">({data.days_remaining} restantes)</span>
          )}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>MTD: {formatCurrency(data.actual)}</span>
          <span className="font-medium text-foreground">{progressPct.toFixed(1).replace('.', ',')}% do objectivo</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progressPct, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${progressPct >= 100 ? 'bg-lupita-green' : 'bg-lupita-amber'}`}
          />
          {progressPct < 100 && (
            <div
              className="absolute top-0 h-full w-px bg-foreground/30"
              style={{ left: '100%' }}
            />
          )}
        </div>
      </div>

      {/* Four main metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* MTD Actual */}
        <div className="rounded-lg bg-slate-500/10 border border-slate-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase">MTD</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(data.actual)}</p>
          <p className="text-[10px] text-muted-foreground">Faturação acumulada até hoje</p>
        </div>

        {/* MTD + Projeção Média */}
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Proj. Ritmo</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(data.projection_avg)}</p>
          <p className="text-[10px] text-muted-foreground">
            MTD + ritmo actual ({(data.performance_ratio * 100).toFixed(1).replace('.', ',')}% do obj.)
          </p>
        </div>

        {/* MTD + Projeção Objectivo */}
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Proj. Objectivo</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(data.projection_target)}</p>
          <p className="text-[10px] text-muted-foreground">MTD + targets dos dias restantes</p>
        </div>

        {/* Objectivo */}
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Objectivo</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(data.target_total)}</p>
          <p className="text-[10px] text-muted-foreground">Meta mensal programada</p>
        </div>
      </div>

      {/* Deltas */}
      <div className="border-t border-border pt-3 mb-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Deltas</p>
        <DeltaRow label="Proj. Ritmo vs Objectivo" delta={data.delta_avg_vs_target} />
        <DeltaRow label="Proj. Objectivo vs Objectivo" delta={data.delta_objTarget_vs_target} />
        <DeltaRow label="Proj. Ritmo vs Proj. Objectivo" delta={data.delta_avg_vs_objTarget} />
      </div>

      {/* Daily metrics */}
      <div className="border-t border-border pt-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Métricas Diárias
        </p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Média diária actual</span>
          <span className="font-medium text-foreground">{formatCurrency(data.avg_daily)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Necessário/dia p/ atingir objectivo</span>
          <span className="font-medium text-foreground">{formatCurrency(data.required_daily)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Gap diário</span>
          <span className={`flex items-center gap-1 font-medium ${gapDaily <= 0 ? 'text-lupita-green' : 'text-lupita-red'}`}>
            <Zap className="h-3 w-3" />
            {gapDaily <= 0 ? '+' : '-'}{formatCurrency(Math.abs(gapDaily))}/dia
          </span>
        </div>
      </div>
    </motion.div>
  );
}
