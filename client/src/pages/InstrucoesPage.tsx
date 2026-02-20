import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Info } from 'lucide-react';
import { Layout } from '@/components/dashboard/Layout';
import { APP_VERSION, APP_VERSION_DATE } from '@/lib/version';

const steps = [
  {
    title: 'Vendas Completo',
    path: 'Relatórios > Vendas > Apuramentos > Completo',
    periods: ['Ano Completo Anterior', 'Este Ano'],
  },
  {
    title: 'Zonas (Canais de Venda)',
    path: 'Relatórios > Vendas > Apuramentos > Zonas',
    periods: ['Ano Completo Anterior', 'Este Ano'],
  },
  {
    title: 'Artigos',
    path: 'Relatórios > Vendas > Apuramentos > Artigos',
    periods: ['Ano Completo Anterior', 'Este Ano'],
  },
  {
    title: 'Análise ABC',
    path: 'Relatórios > Vendas > Rankings > Análise ABC Vendas',
    periods: ['Ano Completo Anterior', 'Este Ano'],
  },
];

const commonRules = [
  'Agrupar por Data',
  'Agrupar por Loja',
  'Retirar LUPITA SEDE em Lojas',
];

const STORAGE_KEY = 'lupita-instrucoes-checked';

function loadChecked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function InstrucoesPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);

  const toggle = useCallback((key: string) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const checkAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    steps.forEach((step, i) => {
      step.periods.forEach((p) => { next[`${i}-${p}`] = true; });
    });
    setChecked(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const uncheckAll = useCallback(() => {
    setChecked({});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
  }, []);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-3xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-lupita-amber/10">
            <Info className="h-5 w-5 text-lupita-amber" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Informações</h1>
            <p className="text-sm text-muted-foreground">Guia de importação semanal de dados</p>
          </div>
        </div>

        {/* Info cards */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Frequência Importação</p>
              <p className="text-sm font-medium text-foreground">Todas as segundas-feiras</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Responsável</p>
              <p className="text-sm font-medium text-foreground">Bruna (Financeiro)</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Versão</p>
              <p className="text-sm font-medium text-foreground">v{APP_VERSION}</p>
              <p className="text-[10px] text-muted-foreground">{APP_VERSION_DATE}</p>
            </div>
          </div>
        </div>

        {/* Regras comuns */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Regras Comuns a Todos os Relatórios</h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm text-foreground">
              <CheckSquare className="h-4 w-4 text-lupita-amber flex-shrink-0" />
              Acessar o{' '}
              <a
                href="https://515449741.zsbmspro.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lupita-amber font-semibold underline underline-offset-2 hover:text-lupita-amber/80 transition-colors"
              >
                ZSbmsPRO
              </a>{' '}
              para extrair os relatórios mencionados abaixo
            </li>
            {commonRules.map((rule) => (
              <li key={rule} className="flex items-center gap-2 text-sm text-foreground">
                <CheckSquare className="h-4 w-4 text-lupita-amber flex-shrink-0" />
                {rule}
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckSquare className="h-4 w-4 text-lupita-amber flex-shrink-0" />
              Certificar de que todas as colunas estão selecionadas (exceto Cód. Externo na ABC)
            </li>
          </ul>
        </div>

        {/* Input Dados */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Input Dados</h2>
            <div className="flex gap-2">
              <button
                onClick={checkAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              >
                Marcar Tudo
              </button>
              <button
                onClick={uncheckAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                Desmarcar Tudo
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {steps.map((step, i) => {
              const allChecked = step.periods.every((p) => checked[`${i}-${p}`]);
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className={`rounded-xl border p-5 shadow-sm transition-colors ${
                    allChecked
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex items-center justify-center h-7 w-7 rounded-full text-sm font-bold flex-shrink-0 transition-colors ${
                      allChecked
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-lupita-amber/10 text-lupita-amber'
                    }`}>
                      {allChecked ? '✓' : i + 1}
                    </span>
                    <div className="flex-1">
                      <h3 className={`text-sm font-semibold mb-1 transition-colors ${
                        allChecked ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}>{step.title}</h3>
                      <p className={`text-xs font-mono bg-muted/50 rounded px-2 py-1 inline-block mb-3 transition-colors ${
                        allChecked ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'
                      }`}>
                        {step.path}
                      </p>

                      <div className="space-y-2">
                        {step.periods.map((period) => {
                          const key = `${i}-${period}`;
                          const isChecked = !!checked[key];
                          return (
                            <label key={period} className="flex items-center gap-2 text-sm cursor-pointer select-none" onClick={() => toggle(key)}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggle(key)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-border accent-amber-500"
                              />
                              <span className={`transition-colors ${
                                isChecked ? 'text-muted-foreground line-through' : 'text-foreground'
                              }`}>
                                {period}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}
