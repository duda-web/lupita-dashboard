import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, AlertCircle, Key } from 'lucide-react';
import { fetchABCInsights } from '@/lib/api';
import type { ABCInsightsResponse } from '@/types';

interface Props {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  hasData: boolean;
}

export function ABCInsightsPanel({ dateFrom, dateTo, storeId, hasData }: Props) {
  const [insights, setInsights] = useState<ABCInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchABCInsights({ dateFrom, dateTo, storeId });
      setInsights(result);
      if (result.error === 'api_key_missing') {
        setError(result.message || 'API key não configurada');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar insights');
    } finally {
      setIsLoading(false);
    }
  };

  // Simple markdown renderer — handles headers, bold, bullets, and paragraphs
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (const line of lines) {
      key++;
      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(<div key={key} className="h-2" />);
        continue;
      }

      // Headers
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={key} className="text-sm font-semibold text-foreground mt-3 mb-1">
            {trimmed.slice(4)}
          </h4>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={key} className="text-sm font-bold text-foreground mt-4 mb-1">
            {trimmed.slice(3)}
          </h3>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={key} className="text-base font-bold text-foreground mt-4 mb-2">
            {trimmed.slice(2)}
          </h2>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const content = trimmed.slice(2);
        elements.push(
          <div key={key} className="flex gap-2 ml-2 text-xs text-muted-foreground leading-relaxed">
            <span className="text-lupita-amber mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
          </div>
        );
      } else {
        elements.push(
          <p
            key={key}
            className="text-xs text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }}
          />
        );
      }
    }

    return elements;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card shadow-sm sticky top-20"
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Insights IA</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Análise inteligente dos dados ABC
        </p>
      </div>

      <div className="p-4">
        {/* No data state */}
        {!hasData && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Importe dados ABC para gerar insights
          </p>
        )}

        {/* API key missing */}
        {insights?.error === 'api_key_missing' && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">API Key Necessária</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure a chave da API Anthropic no ficheiro <code className="text-xs bg-accent px-1 rounded">.env</code> para activar os insights por IA.
            </p>
            <div className="mt-2 p-2 rounded bg-background text-xs font-mono text-muted-foreground">
              ANTHROPIC_API_KEY=sk-ant-...
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !insights?.error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 text-lupita-amber animate-spin" />
              <span className="text-xs text-muted-foreground">A gerar insights...</span>
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-3 bg-accent rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        )}

        {/* Insights content */}
        {insights?.insights && !isLoading && (
          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {renderMarkdown(insights.insights)}
            {insights.generated_at && (
              <p className="text-[10px] text-muted-foreground mt-4 pt-2 border-t border-border">
                Gerado em {new Date(insights.generated_at).toLocaleString('pt-PT')}
              </p>
            )}
          </div>
        )}

        {/* Generate / Regenerate button */}
        {hasData && !isLoading && insights?.error !== 'api_key_missing' && (
          <button
            onClick={generateInsights}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-lupita-amber text-white text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {insights?.insights ? 'Regenerar Insights' : 'Gerar Insights'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
