import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, Download } from 'lucide-react';
import { formatCurrency, formatInteger, formatPercentage } from '@/lib/formatters';
import { STORE_NAMES } from '@/lib/constants';
import { exportCSV } from '@/lib/api';
import { useFilters } from '@/context/FilterContext';
import type { DailySaleRow } from '@/types';
import { toast } from 'sonner';

interface Props {
  data: DailySaleRow[];
}

type SortKey = keyof DailySaleRow;
type SortDir = 'asc' | 'desc';

export function DataTable({ data }: Props) {
  const { filters } = useFilters();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const cmp = aVal < bVal ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleExport = async () => {
    try {
      await exportCSV({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        storeId: filters.storeId,
      });
      toast.success('CSV exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar CSV');
    }
  };

  const columns: { key: SortKey; label: string; format: (row: DailySaleRow) => string; align?: string }[] = [
    { key: 'date', label: 'Data', format: (r) => r.date },
    { key: 'day_of_week', label: 'Dia', format: (r) => r.day_of_week },
    { key: 'store_id', label: 'Loja', format: (r) => STORE_NAMES[r.store_id] || r.store_id },
    { key: 'total_gross', label: 'Faturação', format: (r) => formatCurrency(r.total_gross), align: 'right' },
    { key: 'total_net', label: 'Líquido', format: (r) => formatCurrency(r.total_net), align: 'right' },
    { key: 'total_vat', label: 'IVA', format: (r) => formatCurrency(r.total_vat), align: 'right' },
    { key: 'num_tickets', label: 'Tickets', format: (r) => formatInteger(r.num_tickets), align: 'right' },
    { key: 'avg_ticket', label: 'Ticket Médio', format: (r) => formatCurrency(r.avg_ticket), align: 'right' },
    { key: 'num_customers', label: 'Clientes', format: (r) => formatInteger(r.num_customers), align: 'right' },
    { key: 'avg_per_customer', label: 'VM Pessoa', format: (r) => formatCurrency(r.avg_per_customer), align: 'right' },
    {
      key: 'target_gross',
      label: 'Objectivo',
      format: (r) => formatCurrency(r.target_gross),
      align: 'right',
    },
    {
      key: 'target_gross',
      label: 'Var. Obj.',
      format: (r) => {
        if (r.target_gross === 0) return '-';
        const v = ((r.total_gross - r.target_gross) / r.target_gross) * 100;
        return formatPercentage(v);
      },
      align: 'right',
    },
  ];

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Sem dados para este período</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Detalhe Diário</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-lupita-amber text-white hover:bg-amber-600 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={i}
                  onClick={() => toggleSort(col.key)}
                  className={`px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={`${row.store_id}-${row.date}`}
                className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${
                  row.is_closed ? 'opacity-50 italic' : ''
                }`}
              >
                {columns.map((col, i) => (
                  <td
                    key={i}
                    className={`px-3 py-2 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.format(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
        {data.length} registos
      </div>
    </motion.div>
  );
}
