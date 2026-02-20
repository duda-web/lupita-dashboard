import { motion } from 'framer-motion';
import { BookOpen, CheckSquare } from 'lucide-react';
import { Layout } from '@/components/dashboard/Layout';

const steps = [
  {
    title: 'Vendas Completo',
    path: 'Relatórios > Vendas > Apuramentos > Completo',
    periods: ['Ano Completo Anterior', 'Este Ano'],
    note: 'Todas as colunas selecionadas',
  },
  {
    title: 'Zonas (Canais de Venda)',
    path: 'Relatórios > Vendas > Apuramentos > Zonas',
    periods: ['Ano Completo Anterior', 'Este Ano'],
    note: 'Todas as colunas selecionadas',
  },
  {
    title: 'Artigos',
    path: 'Relatórios > Vendas > Apuramentos > Artigos',
    periods: ['Ano Completo Anterior', 'Este Ano'],
    note: 'Todas as colunas selecionadas',
  },
  {
    title: 'Análise ABC',
    path: 'Relatórios > Vendas > Rankings > Análise ABC Vendas',
    periods: ['Ano Completo Anterior', 'Este Ano'],
    note: 'Todas as colunas selecionadas (exceto: Cód. Externo)',
  },
];

const commonRules = [
  'Agrupar por Data',
  'Agrupar por Loja',
  'Retirar LUPITA SEDE em Lojas',
];

export function InstrucoesPage() {
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
            <BookOpen className="h-5 w-5 text-lupita-amber" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Instruções</h1>
            <p className="text-sm text-muted-foreground">Guia de importação semanal de dados</p>
          </div>
        </div>

        {/* Conceito */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Conceito</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Criação</p>
              <p className="text-sm font-medium text-foreground">Claude Code</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Frequência</p>
              <p className="text-sm font-medium text-foreground">Todas as segundas-feiras</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Responsável</p>
              <p className="text-sm font-medium text-foreground">Bruna (Financeiro)</p>
            </div>
          </div>
        </div>

        {/* Regras comuns */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Regras Comuns a Todos os Relatórios</h2>
          <ul className="space-y-2">
            {commonRules.map((rule) => (
              <li key={rule} className="flex items-center gap-2 text-sm text-foreground">
                <CheckSquare className="h-4 w-4 text-lupita-amber flex-shrink-0" />
                {rule}
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckSquare className="h-4 w-4 text-lupita-amber flex-shrink-0" />
              Certificar de que todas as colunas estão selecionadas
            </li>
          </ul>
        </div>

        {/* Input Dados */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">Input Dados</h2>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-lupita-amber/10 text-lupita-amber text-sm font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1 inline-block mb-3">
                      {step.path}
                    </p>

                    <div className="space-y-2">
                      {step.periods.map((period) => (
                        <label key={period} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                          <input type="checkbox" className="rounded border-border accent-amber-500" />
                          {period}
                        </label>
                      ))}
                    </div>

                    {step.note && (
                      <p className="mt-3 text-xs text-muted-foreground border-l-2 border-lupita-amber/50 pl-2">
                        <span className="font-semibold">{step.note}</span>
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}
