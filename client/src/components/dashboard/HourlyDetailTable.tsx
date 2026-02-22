import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { fetchChartData } from '@/lib/api';
import { formatCurrency, formatInteger } from '@/lib/formatters';
import type { HourlySlotData } from '@/types';
import { List, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

type DayType = 'all' | 'weekday' | 'weekend';

interface Props {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  zone?: string;
}

const DAY_TYPE_LABELS: Record<DayType, string> = {
  all: 'Todos',
  weekday: 'Dias Úteis',
  weekend: 'Fim de Semana',
};

type SortKey = 'time_slot' | 'avg_customers' | 'vm_pessoa' | 'avg_tickets' | 'ticket_medio' | 'avg_revenue';
type SortDir = 'asc' | 'desc';

/** Compute a sortable numeric value for each column */
function getSortValue(row: HourlySlotData, key: SortKey): number {
  switch (key) {
    case 'time_slot': {
      const [h, m] = row.time_slot.split(':').map(Number);
      return h * 60 + m;
    }
    case 'avg_customers':
      return row.days > 0 ? row.num_customers / row.days : 0;
    case 'vm_pessoa':
      return row.num_customers > 0 ? row.total_revenue / row.num_customers : 0;
    case 'avg_tickets':
      return row.days > 0 ? row.num_tickets / row.days : 0;
    case 'ticket_medio':
      return row.num_tickets > 0 ? row.total_revenue / row.num_tickets : 0;
    case 'avg_revenue':
      return row.avg_revenue;
  }
}

export function HourlyDetailTable({ dateFrom, dateTo, storeId, zone }: Props) {
  const [dayType, setDayType] = useState<DayType>('all');
  const [data, setData] = useState<HourlySlotData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('time_slot');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchChartData('hourly_revenue', {
          dateFrom,
          dateTo,
          storeId,
          zone,
          dayType: dayType !== 'all' ? dayType : undefined,
        });
        setData(result as unknown as HourlySlotData[]);
      } catch {
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [dateFrom, dateTo, storeId, zone, dayType]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'time_slot' ? 'asc' : 'desc'); // default desc for numeric, asc for time
    }
  };

  const sortedData = useMemo(() => {
    if (data.length === 0) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  if (data.length === 0 && !isLoading) return null;

  // Classify slots: PICO (top 1), ALTO (top 20% excl. peak), BAIXO (bottom 20%)
  const { peakSlot, highSlots, lowSlots } = (() => {
    if (data.length === 0) return { peakSlot: null, highSlots: new Set<string>(), lowSlots: new Set<string>() };

    const sorted = [...data].sort((a, b) => b.avg_revenue - a.avg_revenue);
    const peak = sorted[0].time_slot;

    // Top 20% (excl. peak) = high movement
    const highCount = Math.max(1, Math.floor(data.length * 0.2));
    const high = new Set(sorted.slice(1, 1 + highCount).map((r) => r.time_slot));

    // Bottom 20% (only slots with revenue > 0 count, but mark the lowest)
    const sortedAsc = [...data].filter((r) => r.avg_revenue > 0).sort((a, b) => a.avg_revenue - b.avg_revenue);
    const lowCount = Math.max(1, Math.floor(sortedAsc.length * 0.30));
    const low = new Set(sortedAsc.slice(0, lowCount).map((r) => r.time_slot));

    return { peakSlot: peak, highSlots: high, lowSlots: low };
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      {/* Header with dayType filter */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Detalhe por Slot</h3>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'weekday', 'weekend'] as DayType[]).map((dt) => (
            <button
              key={dt}
              onClick={() => setDayType(dt)}
              className={`px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors ${
                dayType === dt
                  ? 'bg-lupita-amber text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {DAY_TYPE_LABELS[dt]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="p-4">
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        </div>
      )}

      {/* Table */}
      {!isLoading && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {([
                  { key: 'time_slot' as SortKey, label: 'Hora', align: 'left' },
                  { key: 'avg_customers' as SortKey, label: 'Clientes/dia', align: 'right' },
                  { key: 'vm_pessoa' as SortKey, label: 'VM Pessoa', align: 'right' },
                  { key: 'avg_tickets' as SortKey, label: 'Tickets/dia', align: 'right' },
                  { key: 'ticket_medio' as SortKey, label: 'Ticket Médio', align: 'right' },
                  { key: 'avg_revenue' as SortKey, label: 'Fat. Média/dia', align: 'right' },
                ]).map((col) => {
                  const isActive = sortKey === col.key;
                  const Icon = isActive
                    ? sortDir === 'asc' ? ChevronUp : ChevronDown
                    : ChevronsUpDown;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`text-${col.align} text-[11px] font-semibold uppercase tracking-wide px-4 py-2.5 cursor-pointer select-none transition-colors hover:text-foreground ${
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                        {col.label}
                        <Icon className={`h-3 w-3 ${isActive ? 'text-lupita-amber' : 'text-muted-foreground/50'}`} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row) => {
                const avgCustomers = row.days > 0 ? row.num_customers / row.days : 0;
                const vmPessoa = row.num_customers > 0 ? row.total_revenue / row.num_customers : 0;
                const avgTickets = row.days > 0 ? row.num_tickets / row.days : 0;
                const ticketMedio = row.num_tickets > 0 ? row.total_revenue / row.num_tickets : 0;
                const isPeak = row.time_slot === peakSlot;
                const isHigh = highSlots.has(row.time_slot);
                const isLow = lowSlots.has(row.time_slot);

                const rowBg = isPeak
                  ? 'bg-lupita-amber/5'
                  : isHigh
                  ? 'bg-emerald-500/5'
                  : isLow
                  ? 'bg-red-500/5'
                  : '';

                return (
                  <tr
                    key={row.time_slot}
                    className={`border-b border-border/50 ${rowBg}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs font-medium text-foreground">
                      {row.time_slot}
                      {isPeak && (
                        <span className="ml-1.5 text-[9px] font-semibold text-lupita-amber bg-lupita-amber/10 px-1.5 py-0.5 rounded-full">PICO</span>
                      )}
                      {isHigh && (
                        <span className="ml-1.5 text-[9px] font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">ALTO</span>
                      )}
                      {isLow && (
                        <span className="ml-1.5 text-[9px] font-semibold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full">BAIXO</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-foreground tabular-nums">
                      {avgCustomers.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-foreground tabular-nums">
                      {formatCurrency(vmPessoa)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-foreground tabular-nums">
                      {avgTickets.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-foreground tabular-nums">
                      {formatCurrency(ticketMedio)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-medium text-foreground tabular-nums">
                      {formatCurrency(row.avg_revenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="px-4 py-2.5 text-xs font-semibold text-foreground">TOTAL</td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground tabular-nums">
                  {data.length > 0 && data[0].days > 0
                    ? (data.reduce((s, r) => s + r.num_customers, 0) / data[0].days).toFixed(1).replace('.', ',')
                    : '0'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground tabular-nums">
                  {(() => {
                    const totRev = data.reduce((s, r) => s + r.total_revenue, 0);
                    const totCust = data.reduce((s, r) => s + r.num_customers, 0);
                    return totCust > 0 ? formatCurrency(totRev / totCust) : '—';
                  })()}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground tabular-nums">
                  {data.length > 0 && data[0].days > 0
                    ? (data.reduce((s, r) => s + r.num_tickets, 0) / data[0].days).toFixed(1).replace('.', ',')
                    : '0'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground tabular-nums">
                  {(() => {
                    const totRev = data.reduce((s, r) => s + r.total_revenue, 0);
                    const totTix = data.reduce((s, r) => s + r.num_tickets, 0);
                    return totTix > 0 ? formatCurrency(totRev / totTix) : '—';
                  })()}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground tabular-nums">
                  {data.length > 0 && data[0].days > 0
                    ? formatCurrency(data.reduce((s, r) => s + r.total_revenue, 0) / data[0].days)
                    : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </motion.div>
  );
}
