import { useState, useEffect, useRef } from 'react';
import { Filters } from '@/components/dashboard/Filters';
import { ABCKPICards } from '@/components/abc/ABCKPICards';
import { ABCRankingTable } from '@/components/abc/ABCRankingTable';
import { ABCParetoChart } from '@/components/abc/ABCParetoChart';
import { ABCDistributionChart } from '@/components/abc/ABCDistributionChart';
import { ABCEvolutionChart } from '@/components/abc/ABCEvolutionChart';
import { ABCStoreComparison } from '@/components/abc/ABCStoreComparison';
import { useFilters } from '@/context/FilterContext';
import {
  fetchABCRanking,
  fetchABCDistribution,
  fetchABCPareto,
  fetchABCEvolution,
  fetchABCStoreComparison,
  fetchABCConcentration,
} from '@/lib/api';
import type {
  ABCArticle,
  ABCDistributionResponse,
  ABCConcentration,
  ABCEvolutionPoint,
  ABCStoreComparisonPoint,
  ABCCategory,
} from '@/types';
import { useNavigate } from 'react-router-dom';
import { Upload, BarChart3, Pizza, UtensilsCrossed, Droplets, Wine, GlassWater, Cake, LayoutGrid, Store, Truck } from 'lucide-react';
import { motion } from 'framer-motion';

type Channel = 'all' | 'loja' | 'delivery';

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: 'Todos', icon: LayoutGrid },
  { value: 'loja', label: 'Restaurante', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Truck },
];

const CATEGORY_OPTIONS: { value: ABCCategory; label: string; icon: typeof BarChart3 }[] = [
  { value: 'all', label: 'Todos', icon: BarChart3 },
  { value: 'pizza', label: 'Pizzas', icon: Pizza },
  { value: 'pizza_entradas', label: 'Pizzas & Entradas', icon: UtensilsCrossed },
  { value: 'extras_molhos', label: 'Extras & Molhos', icon: Droplets },
  { value: 'bebidas_alcoolicas', label: 'Bebidas Alc.', icon: Wine },
  { value: 'soft_drinks', label: 'Soft Drinks', icon: GlassWater },
  { value: 'sobremesas', label: 'Sobremesas', icon: Cake },
];

export function ABCPage() {
  const { filters } = useFilters();
  const navigate = useNavigate();

  const [category, setCategory] = useState<ABCCategory>('all');
  const [channel, setChannel] = useState<Channel>('all');
  const [ranking, setRanking] = useState<ABCArticle[]>([]);
  const [distribution, setDistribution] = useState<ABCDistributionResponse | null>(null);
  const [pareto, setPareto] = useState<ABCArticle[]>([]);
  const [evolution, setEvolution] = useState<ABCEvolutionPoint[]>([]);
  const [storeComparison, setStoreComparison] = useState<ABCStoreComparisonPoint[]>([]);
  const [concentration, setConcentration] = useState<ABCConcentration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // First load: full loading spinner. Subsequent loads: subtle refresh overlay
    if (!hasLoadedOnce.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    const params = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      storeId: filters.storeId,
      category,
      channel,
    };

    Promise.all([
      fetchABCRanking(params),
      fetchABCDistribution(params),
      fetchABCPareto(params),
      fetchABCEvolution(params),
      !filters.storeId ? fetchABCStoreComparison({ dateFrom: params.dateFrom, dateTo: params.dateTo, category, channel }) : Promise.resolve([]),
      fetchABCConcentration(params),
    ])
      .then(([rank, dist, par, evo, store, conc]) => {
        if (cancelled) return;
        setRanking(rank || []);
        setDistribution(dist || null);
        setPareto(par || []);
        setEvolution(evo || []);
        setStoreComparison(store || []);
        setConcentration(conc || null);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
          hasLoadedOnce.current = true;
        }
      });

    return () => { cancelled = true; };
  }, [filters, category, channel]);

  const hasData = ranking.length > 0;

  return (
    <div className="space-y-4">
      {/* Sticky header + filters + category tabs */}
        <div className="sticky top-14 md:top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 sticky-header-bg border-b border-border">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-5 w-5 text-lupita-amber" />
            <h1 className="text-xl font-bold text-foreground">Análise ABC</h1>
          </div>

          {/* Filters with channel + category selectors */}
          <Filters
            hideComparison
            children={
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {CHANNEL_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = channel === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setChannel(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-lupita-amber text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            }
            bottomChildren={
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {CATEGORY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = category === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setCategory(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-lupita-amber text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            }
          />
        </div>

        {/* Initial loading state (first load only) */}
        {isLoading && !hasData && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-lupita-amber border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !hasData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Sem dados ABC
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {category !== 'all'
                ? 'Sem dados para esta categoria no período seleccionado'
                : 'Importa um ficheiro "Análise ABC Vendas" para ver as análises'}
            </p>
            {category === 'all' && (
              <button
                onClick={() => navigate('/upload')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lupita-amber text-white text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Importar Ficheiro
              </button>
            )}
          </motion.div>
        )}

        {/* Main content — stays visible during refresh */}
        {hasData && (
          <div className={`space-y-4 transition-opacity duration-200 ${isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            {/* Refresh indicator */}
            {isRefreshing && (
              <div className="flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-lupita-amber border-t-transparent" />
              </div>
            )}
            {/* KPI Cards */}
            <ABCKPICards distribution={distribution} concentration={concentration} />

            {/* Ranking Table */}
            <ABCRankingTable data={ranking} />

            {/* Pareto Chart */}
            <ABCParetoChart data={pareto} />

            {/* Distribution + Store Comparison side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ABCDistributionChart data={distribution} />
              {!filters.storeId && storeComparison.length > 0 && (
                <ABCStoreComparison data={storeComparison} />
              )}
            </div>

            {/* Evolution - full width */}
            <ABCEvolutionChart data={evolution} />
          </div>
        )}
    </div>
  );
}
