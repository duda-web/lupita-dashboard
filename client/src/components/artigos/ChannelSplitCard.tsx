import { motion } from 'framer-motion';
import { Store, Truck } from 'lucide-react';
import type { ChannelSplitData } from '@/types';
import { formatCurrency, formatInteger, formatPercentage } from '@/lib/formatters';

interface Props {
  data: ChannelSplitData | null;
}

export function ChannelSplitCard({ data }: Props) {
  if (!data || data.total_revenue === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">Delivery vs Restaurante</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de canais para o periodo selecionado
        </p>
      </motion.div>
    );
  }

  const deliveryPct = (data.delivery_revenue / data.total_revenue) * 100;
  const lojaPct = (data.loja_revenue / data.total_revenue) * 100;
  const deliveryQtyPct = data.total_qty > 0 ? (data.delivery_qty / data.total_qty) * 100 : 0;
  const lojaQtyPct = data.total_qty > 0 ? (data.loja_qty / data.total_qty) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Delivery vs Restaurante
      </h3>

      {/* Revenue bar */}
      <div className="space-y-4">
        {/* Faturacao */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Faturacao</span>
            <span className="text-xs text-muted-foreground">{formatCurrency(data.total_revenue)}</span>
          </div>
          <div className="flex h-8 rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-center transition-all duration-500"
              style={{ width: `${lojaPct}%`, backgroundColor: '#f59e0b' }}
            >
              {lojaPct > 15 && (
                <span className="text-xs font-semibold text-white">{lojaPct.toFixed(1)}%</span>
              )}
            </div>
            <div
              className="flex items-center justify-center transition-all duration-500"
              style={{ width: `${deliveryPct}%`, backgroundColor: '#06b6d4' }}
            >
              {deliveryPct > 15 && (
                <span className="text-xs font-semibold text-white">{deliveryPct.toFixed(1)}%</span>
              )}
            </div>
          </div>
        </div>

        {/* Quantidade */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Quantidade</span>
            <span className="text-xs text-muted-foreground">{formatInteger(data.total_qty)} un</span>
          </div>
          <div className="flex h-8 rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-center transition-all duration-500"
              style={{ width: `${lojaQtyPct}%`, backgroundColor: '#f59e0b' }}
            >
              {lojaQtyPct > 15 && (
                <span className="text-xs font-semibold text-white">{lojaQtyPct.toFixed(1)}%</span>
              )}
            </div>
            <div
              className="flex items-center justify-center transition-all duration-500"
              style={{ width: `${deliveryQtyPct}%`, backgroundColor: '#06b6d4' }}
            >
              {deliveryQtyPct > 15 && (
                <span className="text-xs font-semibold text-white">{deliveryQtyPct.toFixed(1)}%</span>
              )}
            </div>
          </div>
        </div>

        {/* Legend & details */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* Loja */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900/30">
            <div className="flex items-center gap-2 mb-2">
              <Store className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Restaurante</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatCurrency(data.loja_revenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatInteger(data.loja_qty)} unidades</p>
          </div>

          {/* Delivery */}
          <div className="rounded-lg bg-cyan-50 dark:bg-cyan-950/20 p-3 border border-cyan-200 dark:border-cyan-900/30">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4 text-cyan-500" />
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">Delivery</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatCurrency(data.delivery_revenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatInteger(data.delivery_qty)} unidades</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
