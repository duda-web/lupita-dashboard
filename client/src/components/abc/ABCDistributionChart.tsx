import { motion } from 'framer-motion';
import { Grid3x3 } from 'lucide-react';
import type { ABCDistributionResponse } from '@/types';
import { ABC_MATRIX_LABELS } from '@/types';
import { formatInteger } from '@/lib/formatters';

const VALUE_LABELS = ['A', 'B', 'C'];
const QTY_LABELS = ['A', 'B', 'C'];

interface Props {
  data: ABCDistributionResponse | null;
}

export function ABCDistributionChart({ data }: Props) {
  if (!data || !data.matrix || data.matrix.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Grid3x3 className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Matriz ABC</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
      </motion.div>
    );
  }

  // Build a lookup: "AA" -> { count, revenue_pct, qty_pct, ... }
  const lookup: Record<string, { count: number; revenue_pct: number; qty_pct: number }> = {};
  for (const item of data.matrix) {
    lookup[item.class] = {
      count: item.count,
      revenue_pct: item.revenue_pct,
      qty_pct: item.qty_pct,
    };
  }

  // Fixed opacity per cell class so colors are consistent across all category filters
  const FIXED_OPACITY: Record<string, number> = {
    AA: 0.55, AB: 0.45, AC: 0.35,
    BA: 0.45, BB: 0.40, BC: 0.35,
    CA: 0.35, CB: 0.35, CC: 0.50,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-1">
        <Grid3x3 className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Matriz ABC — Valor × Quantidade</h3>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">Linhas = Valor (faturação) · Colunas = Quantidade</p>

      {/* Matrix grid */}
      <div className="space-y-0">
        {/* Column headers */}
        <div className="grid grid-cols-[32px_1fr_1fr_1fr] gap-1 mb-1">
          <div />
          {QTY_LABELS.map((q) => (
            <div key={q} className="text-center text-[10px] font-semibold text-muted-foreground">
              Qtd {q}
            </div>
          ))}
        </div>

        {/* Rows */}
        {VALUE_LABELS.map((v) => (
          <div key={v} className="grid grid-cols-[32px_1fr_1fr_1fr] gap-1 mb-1">
            {/* Row label */}
            <div className="flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
              Val {v}
            </div>

            {/* Cells */}
            {QTY_LABELS.map((q) => {
              const cls = `${v}${q}`;
              const meta = ABC_MATRIX_LABELS[cls];
              const cell = lookup[cls] || { count: 0, revenue_pct: 0, qty_pct: 0 };
              const opacity = cell.count > 0 ? (FIXED_OPACITY[cls] || 0.40) : 0.08;

              return (
                <div
                  key={cls}
                  className="rounded-lg p-2 text-center transition-all hover:scale-[1.03] cursor-default"
                  style={{
                    backgroundColor: meta ? `${meta.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` : '#6b728020',
                    border: `1px solid ${meta?.color || '#6b7280'}30`,
                  }}
                  title={`${meta?.label || cls}: ${cell.count} artigos, ${cell.revenue_pct.toFixed(1)}% faturação`}
                >
                  <p className="text-xs font-bold" style={{ color: cls === 'CC' ? '#ffffff' : (meta?.color || '#6b7280') }}>
                    {cls}
                  </p>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {formatInteger(cell.count)}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {cell.revenue_pct.toFixed(1)}% fat.
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend in 3x3 grid matching matrix layout */}
      <div className="mt-3 pt-2 border-t border-border">
        <div className="grid grid-cols-3 gap-1">
          {VALUE_LABELS.map((v) =>
            QTY_LABELS.map((q) => {
              const cls = `${v}${q}`;
              const meta = ABC_MATRIX_LABELS[cls];
              if (!meta) return null;
              return (
                <div key={cls} className="flex items-center justify-center gap-1.5 px-1 py-0.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                  <span className="text-[10px] text-muted-foreground">
                    <span className="font-semibold">{cls}</span> {meta.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
