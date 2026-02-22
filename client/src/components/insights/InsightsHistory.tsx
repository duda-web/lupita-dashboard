import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronRight, X, Clock, MapPin, Calendar } from 'lucide-react';
import { fetchInsightsHistory, fetchInsightById } from '@/lib/api';
import type { InsightsHistoryEntry, InsightsGenerateResponse } from '@/types';

const PERIOD_LABELS: Record<string, string> = {
  week: 'Semana',
  month: 'Mes',
  year: 'Ano',
  custom: 'Personalizado',
};

const STORE_LABELS: Record<string, string> = {
  cais_do_sodre: 'Cais do Sodre',
  alvalade: 'Alvalade',
};

const CHANNEL_LABELS: Record<string, string> = {
  all: 'Todos',
  loja: 'Restaurante',
  delivery: 'Delivery',
};

interface Props {
  onLoadInsight: (data: InsightsGenerateResponse) => void;
}

export function InsightsHistory({ onLoadInsight }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<InsightsHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load history when drawer opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchInsightsHistory({ limit: 30 })
        .then(setEntries)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleSelect = async (id: number) => {
    try {
      const full = await fetchInsightById(id);
      onLoadInsight({
        id: full.id,
        insights: full.insights,
        generated_at: full.generated_at,
        period: full.period,
        dateFrom: full.date_from,
        dateTo: full.date_to,
        storeId: full.store_id,
        channel: full.channel,
      });
      setIsOpen(false);
    } catch (err) {
      console.error('Error loading insight:', err);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-lupita-amber/50 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        Historico
      </button>

      {/* Drawer overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-card border-l border-border shadow-xl overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-lupita-amber" />
                  <h3 className="text-sm font-semibold text-foreground">Historico de Insights</h3>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-accent transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* List */}
              <div className="p-2">
                {isLoading && (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-lupita-amber border-t-transparent" />
                  </div>
                )}

                {!isLoading && entries.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhum insight gerado ainda.
                  </p>
                )}

                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleSelect(entry.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors mb-1 group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">
                        {PERIOD_LABELS[entry.period] || entry.period}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {entry.date_from} → {entry.date_to}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {entry.store_id ? (STORE_LABELS[entry.store_id] || entry.store_id) : 'Todas'}
                      </span>
                      {entry.channel && entry.channel !== 'all' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent">
                          {CHANNEL_LABELS[entry.channel] || entry.channel}
                        </span>
                      )}
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.generated_at).toLocaleString('pt-PT', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
