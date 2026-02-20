import { useState, useEffect } from 'react';
import { Layout } from '@/components/dashboard/Layout';
import { Filters } from '@/components/dashboard/Filters';
import { TopArticlesChart } from '@/components/artigos/TopArticlesChart';
import { StoreComparisonChart } from '@/components/artigos/StoreComparisonChart';
import { ChannelSplitCard } from '@/components/artigos/ChannelSplitCard';
import { CategoryMixChart } from '@/components/artigos/CategoryMixChart';
import { useFilters } from '@/context/FilterContext';
import { fetchChartData } from '@/lib/api';
import type { ArticleDataPoint, ArticleByStoreDataPoint, ChannelSplitData, CategoryMixDataPoint } from '@/types';
import { useNavigate } from 'react-router-dom';
import { Upload, ShoppingBag, Store, Truck, LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';

type Channel = 'all' | 'loja' | 'delivery';

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: 'Todas', icon: LayoutGrid },
  { value: 'loja', label: 'Loja', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Truck },
];

export function ArtigosPage() {
  const { filters } = useFilters();
  const navigate = useNavigate();

  const [channel, setChannel] = useState<Channel>('all');
  const [topArticles, setTopArticles] = useState<ArticleDataPoint[]>([]);
  const [articlesByStore, setArticlesByStore] = useState<ArticleByStoreDataPoint[]>([]);
  const [channelSplit, setChannelSplit] = useState<ChannelSplitData | null>(null);
  const [categoryMix, setCategoryMix] = useState<CategoryMixDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const params = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      storeId: filters.storeId,
      channel,
    };

    Promise.all([
      fetchChartData('top_articles', params),
      // Store comparison only when not filtering by a single store
      !filters.storeId
        ? fetchChartData('articles_by_store', params)
        : Promise.resolve([]),
      // Channel split only when viewing "all" channels
      channel === 'all'
        ? fetchChartData('channel_split', { dateFrom: filters.dateFrom, dateTo: filters.dateTo, storeId: filters.storeId }) as Promise<any>
        : Promise.resolve(null),
      // Category mix — always fetch
      fetchChartData('category_mix', params),
    ])
      .then(([articles, byStore, split, catMix]) => {
        if (cancelled) return;
        setTopArticles(articles || []);
        setArticlesByStore(byStore || []);
        setChannelSplit(split || null);
        setCategoryMix(catMix || []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters, channel]);

  const hasData = topArticles.length > 0;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <ShoppingBag className="h-5 w-5 text-lupita-amber" />
          <h1 className="text-xl font-bold text-foreground">Analise de Artigos</h1>
        </div>

        {/* Filters with channel selector injected */}
        <Filters>
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
        </Filters>

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
            <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Sem dados de artigos
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Importa um ficheiro "Apuramento Artigos" para ver as analises
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

        {/* Charts */}
        {!isLoading && hasData && (
          <div className="space-y-4">
            {/* Top Articles side by side: Revenue & Quantity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopArticlesChart data={topArticles} metric="revenue" />
              <TopArticlesChart data={topArticles} metric="quantity" />
            </div>

            {/* Category mix + Channel split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Category donut — always show, takes 2 cols */}
              <div className="lg:col-span-2">
                <CategoryMixChart data={categoryMix} />
              </div>

              {/* Channel split — when viewing "all" channels */}
              {channel === 'all' && channelSplit ? (
                <ChannelSplitCard data={channelSplit} />
              ) : (
                <div />
              )}
            </div>

            {/* Store comparison — full width, only when not filtering by store */}
            {!filters.storeId && articlesByStore.length > 0 && (
              <StoreComparisonChart data={articlesByStore} />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
