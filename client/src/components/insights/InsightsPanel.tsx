import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, AlertCircle, Key } from 'lucide-react';
import type { InsightsGenerateResponse } from '@/types';

interface Props {
  data: InsightsGenerateResponse | null;
  isLoading: boolean;
  error: string | null;
}

interface Section {
  title: string;
  content: string;
}

// Titles that get full-width (col-span-2) in the grid
const FULL_WIDTH_KEYWORDS = ['Resumo Executivo', 'Plano de Ações', 'Plano de Acões', 'Hipóteses'];

export function InsightsPanel({ data, isLoading, error }: Props) {
  // Split markdown into sections by ## headers
  const splitIntoSections = (md: string): Section[] => {
    const sections: Section[] = [];
    const parts = md.split(/^## /m);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      if (i === 0) {
        // Text before the first ## — skip or treat as intro
        // Only include if it has meaningful content (not just ---)
        const cleaned = part.replace(/^---+$/gm, '').trim();
        if (cleaned) {
          sections.push({ title: '', content: cleaned });
        }
        continue;
      }

      const newlineIdx = part.indexOf('\n');
      if (newlineIdx === -1) {
        sections.push({ title: part, content: '' });
      } else {
        sections.push({
          title: part.slice(0, newlineIdx).trim(),
          content: part.slice(newlineIdx + 1).trim(),
        });
      }
    }

    return sections;
  };

  // Render markdown content (bullets, sub-headers, paragraphs, tables)
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;
    let tableRows: string[][] = [];
    let tableHeaders: string[] = [];
    let inTable = false;

    const flushTable = () => {
      if (tableHeaders.length > 0 || tableRows.length > 0) {
        elements.push(
          <div key={`table-${key}`} className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">
              {tableHeaders.length > 0 && (
                <thead>
                  <tr>
                    {tableHeaders.map((h, i) => (
                      <th key={i} className="text-left px-2 py-1.5 font-semibold text-foreground border-b border-border bg-accent/50">
                        {h.trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-accent/20'}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-2 py-1.5 text-muted-foreground border-b border-border/50"
                        dangerouslySetInnerHTML={{ __html: cell.trim().replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableHeaders = [];
        tableRows = [];
        inTable = false;
      }
    };

    for (const line of lines) {
      key++;
      const trimmed = line.trim();

      // Table detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.slice(1, -1).split('|');
        // Separator row (|---|---|)
        if (cells.every(c => /^[\s-:]+$/.test(c))) {
          continue;
        }
        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        continue;
      } else if (inTable) {
        flushTable();
      }

      if (!trimmed) {
        elements.push(<div key={key} className="h-1.5" />);
        continue;
      }

      // Sub-headers (### inside a card)
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={key} className="text-xs font-semibold text-foreground mt-3 mb-1">
            {trimmed.slice(4)}
          </h4>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={key} className="text-sm font-bold text-foreground mt-3 mb-1">
            {trimmed.slice(2)}
          </h2>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const content = trimmed.slice(2);
        // Numbered sub-items (e.g. "1. **Capacidade/Staffing:**")
        elements.push(
          <div key={key} className="flex gap-2 ml-1 text-xs text-muted-foreground leading-relaxed">
            <span className="text-lupita-amber mt-0.5 flex-shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
          </div>
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        // Numbered list items (1. 2. 3. etc)
        const num = trimmed.match(/^(\d+)\.\s/)![1];
        const content = trimmed.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={key} className="flex gap-2 ml-1 text-xs text-muted-foreground leading-relaxed">
            <span className="text-lupita-amber mt-0.5 flex-shrink-0 font-semibold text-[10px] min-w-[14px]">{num}.</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
          </div>
        );
      } else if (trimmed.startsWith('---')) {
        elements.push(<hr key={key} className="border-border/50 my-2" />);
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

    // Flush any remaining table
    if (inTable) flushTable();

    return elements;
  };

  const isFullWidth = (title: string) =>
    FULL_WIDTH_KEYWORDS.some(kw => title.includes(kw));

  return (
    <div>
      {/* API key missing */}
      {data?.error === 'api_key_missing' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm p-4 md:p-6"
        >
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">API Key Necessaria</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure a chave da API Anthropic no ficheiro <code className="text-xs bg-accent px-1 rounded">.env</code> para activar os insights por IA.
            </p>
            <div className="mt-2 p-2 rounded bg-background text-xs font-mono text-muted-foreground">
              ANTHROPIC_API_KEY=sk-ant-...
            </div>
          </div>
        </motion.div>
      )}

      {/* Error state */}
      {error && data?.error !== 'api_key_missing' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm p-4 md:p-6"
        >
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm p-4 md:p-6"
        >
          <div className="space-y-3 py-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              <RefreshCw className="h-5 w-5 text-lupita-amber animate-spin" />
              <span className="text-sm text-muted-foreground">A gerar insights completos...</span>
            </div>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-3 bg-accent rounded animate-pulse" style={{ width: `${50 + Math.random() * 50}%` }} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Insights content — split into cards by section */}
      {data?.insights && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {splitIntoSections(data.insights).map((section, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className={`rounded-xl border border-border bg-card shadow-sm p-4 md:p-5 ${
                isFullWidth(section.title) ? 'lg:col-span-2' : ''
              }`}
            >
              {section.title && (
                <h3 className="text-sm font-bold text-foreground mb-2 pb-2 border-b border-border/50">
                  {section.title}
                </h3>
              )}
              <div className="space-y-0.5">
                {renderMarkdown(section.content)}
              </div>
            </motion.div>
          ))}

          {/* Timestamp */}
          {data.generated_at && (
            <div className="lg:col-span-2">
              <p className="text-[10px] text-muted-foreground mt-1">
                Gerado em {new Date(data.generated_at).toLocaleString('pt-PT')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !isLoading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card shadow-sm p-4 md:p-6"
        >
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Seleccione o periodo e clique em "Gerar Insights" para analisar os dados.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
