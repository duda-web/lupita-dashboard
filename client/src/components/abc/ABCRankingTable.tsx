import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import type { ABCArticle } from '@/types';
import { ABC_MATRIX_LABELS } from '@/types';
import { formatCurrency, formatInteger } from '@/lib/formatters';

const FILTER_OPTIONS = [
  { key: 'all', label: 'Todos', classes: null as string[] | null },
  { key: 'estrelas', label: 'Estrelas', classes: ['AA'] },
  { key: 'premium', label: 'Premium', classes: ['AB', 'AC'] },
  { key: 'popular', label: 'Popular', classes: ['BA', 'CA'] },
  { key: 'core', label: 'Core', classes: ['BB', 'BC', 'CB'] },
  { key: 'risco', label: 'Risco', classes: ['CC'] },
];

const FILTER_COLORS: Record<string, { bg: string; text: string }> = {
  estrelas: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  premium: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400' },
  popular: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  core: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  risco: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
};

type SortKey = 'ranking' | 'total_value' | 'total_qty' | 'value_pct';
const SORT_DEFAULTS: Record<SortKey, 'asc' | 'desc'> = {
  ranking: 'asc',
  total_value: 'desc',
  total_qty: 'desc',
  value_pct: 'desc',
};

interface Props {
  data: ABCArticle[];
}

export function ABCRankingTable({ data }: Props) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('ranking');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let items = [...data];

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((d) => d.article_name.toLowerCase().includes(q));
    }

    if (groupFilter !== 'all') {
      const group = FILTER_OPTIONS.find((f) => f.key === groupFilter);
      if (group?.classes) {
        items = items.filter((d) => group.classes!.includes(d.abc_class));
      }
    }

    items.sort((a, b) => {
      const aVal = a[sortKey] as number;
      const bVal = b[sortKey] as number;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return items;
  }, [data, groupFilter, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULTS[key]);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 text-muted-foreground/30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-lupita-amber" />
      : <ChevronDown className="h-3 w-3 text-lupita-amber" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      {/* Header with search + group filter */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Ranking ABC</h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar artigo..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-lupita-amber w-44"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = groupFilter === opt.key;
            const colors = FILTER_COLORS[opt.key];
            return (
              <button
                key={opt.key}
                onClick={() => setGroupFilter(opt.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? opt.key === 'all'
                      ? 'bg-lupita-amber text-white'
                      : `${colors?.bg || ''} ${colors?.text || ''}`
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground cursor-pointer" onClick={() => handleSort('ranking')}>
                <span className="flex items-center gap-1"># <SortIcon col="ranking" /></span>
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Artigo</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Classe</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer" onClick={() => handleSort('total_value')}>
                <span className="flex items-center justify-end gap-1">Faturação <SortIcon col="total_value" /></span>
              </th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer" onClick={() => handleSort('total_qty')}>
                <span className="flex items-center justify-end gap-1">Qtd <SortIcon col="total_qty" /></span>
              </th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground cursor-pointer" onClick={() => handleSort('value_pct')}>
                <span className="flex items-center justify-end gap-1">Peso <SortIcon col="value_pct" /></span>
              </th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Acum.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filtered.map((item) => {
              const meta = ABC_MATRIX_LABELS[item.abc_class];
              return (
                <tr key={item.article_name} className="hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground font-mono">{item.ranking}</td>
                  <td className="px-3 py-2 font-medium text-foreground max-w-[200px] truncate">
                    {item.article_name}
                    {item.code_count > 1 && (
                      <span className="ml-1 text-muted-foreground font-normal text-[10px]">({item.code_count} cód.)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${meta?.bgClass || 'bg-gray-100'} ${meta?.textClass || 'text-gray-500'}`}
                      title={meta?.label || item.abc_class}
                    >
                      {item.abc_class}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatCurrency(item.total_value)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{formatInteger(item.total_qty)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{(item.value_pct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{(item.cumulative_pct * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum artigo encontrado</p>
        )}
      </div>

      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
        {filtered.length} de {data.length} artigos
      </div>
    </motion.div>
  );
}
