import { useState, useEffect } from 'react';
import { Layout } from '@/components/dashboard/Layout';
import { Filters } from '@/components/dashboard/Filters';
import { ABCKPICards } from '@/components/abc/ABCKPICards';
import { ABCRankingTable } from '@/components/abc/ABCRankingTable';
import { ABCParetoChart } from '@/components/abc/ABCParetoChart';
import { ABCDistributionChart } from '@/components/abc/ABCDistributionChart';
import { ABCEvolutionChart } from '@/components/abc/ABCEvolutionChart';
import { ABCStoreComparison } from '@/components/abc/ABCStoreComparison';
import { ABCInsightsPanel } from '@/components/abc/ABCInsightsPanel';
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
} from '@/types';
import { useNavigate } from 'react-router-dom';
import { Upload, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

export function ABCPage() {
  const { filters } = useFilters();
  const navigate = useNavigate();

  const [ranking, setRanking] = useState<ABCArticle[]>([]);
  const [distribution, setDistribution] = useState<ABCDistributionResponse | null>(null);
  const [pareto, setPareto] = useState<ABCArticle[]>([]);
  const [evolution, setEvolution] = useState<ABCEvolutionPoint[]>([]);
  const [storeComparison, setStoreComparison] = useState<ABCStoreComparisonPoint[]>([]);
  const [concentration, setConcentration] = useState<ABCConcentration | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const params = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      storeId: filters.storeId,
    };

    Promise.all([
      fetchABCRanking(params),
      fetchABCDistribution(params),
      fetchABCPareto(params),
      fetchABCEvolution(params),
      !filters.storeId ? fetchABCStoreComparison({ dateFrom: params.dateFrom, dateTo: params.dateTo }) : Promise.resolve([]),
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
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters]);

  const hasData = ranking.length > 0;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-5 w-5 text-lupita-amber" />
          <h1 className="text-xl font-bold text-foreground">Análise ABC</h1>
        </div>

        <Filters />

        {/* Loading state */}
        {isLoading && (
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
              Importa um ficheiro "Análise ABC Vendas" para ver as análises
            </p>
            <button
              onClick={() => navigate('/upload')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lupita-amber text-white text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Importar Ficheiro
            </button>
          </motion.div>
        )}

        {/* Main content */}
        {!isLoading && hasData && (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left column - Charts (60%) */}
            <div className="flex-1 lg:w-[60%] space-y-4">
              {/* KPI Cards */}
              <ABCKPICards distribution={distribution} concentration={concentration} />

              {/* Ranking Table */}
              <ABCRankingTable data={ranking} />

              {/* Pareto Chart */}
              <ABCParetoChart data={pareto} />

              {/* Distribution + Evolution side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ABCDistributionChart data={distribution} />
                <ABCEvolutionChart data={evolution} />
              </div>

              {/* Store Comparison - only when no store filter */}
              {!filters.storeId && storeComparison.length > 0 && (
                <ABCStoreComparison data={storeComparison} />
              )}
            </div>

            {/* Right column - Insights (40%) */}
            <div className="lg:w-[40%]">
              <ABCInsightsPanel
                dateFrom={filters.dateFrom}
                dateTo={filters.dateTo}
                storeId={filters.storeId}
                hasData={hasData}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
