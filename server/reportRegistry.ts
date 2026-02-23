/**
 * Report Registry — Single source of truth for all ZSBMS reports.
 *
 * Adding a new report? Just add an entry to REPORT_REGISTRY below.
 * Everything else (InstrucoesPage display, ZSBMS export, sync import)
 * picks it up automatically.
 */

import type { ImportResult } from './services/importService';
import {
  importXlsxFile,
  importZoneFile,
  importArticleFile,
  importABCFile,
  importHourlyFile,
} from './services/importService';

// ─── Types ─────────────────────────────────────────────────────────

export type ReportKey =
  | 'full_clearance'
  | 'zones'
  | 'items'
  | 'abc_analysis'
  | 'hourly_totals';

/** Display metadata sent to the frontend */
export interface ReportDisplayInfo {
  key: string;
  title: string;
  zsbmsPath: string;
  periods: string[];
  extraRules?: string[];
}

/** Full report definition (server-only) */
export interface ReportDefinition {
  key: ReportKey;

  // Display (sent to frontend via API)
  title: string;
  zsbmsPath: string;
  periods: string[];
  extraRules?: string[];

  // ZSBMS Export
  zsbmsId: string;
  exportFileName: string;
  formParams: Record<string, string>;

  // Import
  importFn: (filePath: string) => ImportResult;
}

// ─── Common Display Rules ──────────────────────────────────────────

export const COMMON_RULES = [
  'Agrupar por Data',
  'Agrupar por Loja',
  'Retirar LUPITA SEDE em Lojas',
];

// ─── The Registry ──────────────────────────────────────────────────

export const REPORT_REGISTRY: ReportDefinition[] = [
  {
    key: 'full_clearance',
    title: 'Vendas Completo',
    zsbmsPath: 'Relatórios > Vendas > Apuramentos > Completo',
    periods: ['Este Ano'],
    zsbmsId: '48',
    exportFileName: 'Vendas_Completo',
    formParams: { group_by_stores: '1' },
    importFn: importXlsxFile,
  },
  {
    key: 'zones',
    title: 'Zonas (Canais de Venda)',
    zsbmsPath: 'Relatórios > Vendas > Apuramentos > Zonas',
    periods: ['Este Ano'],
    zsbmsId: '46',
    exportFileName: 'Zonas',
    formParams: { group_by_stores: '1' },
    importFn: importZoneFile,
  },
  {
    key: 'items',
    title: 'Artigos',
    zsbmsPath: 'Relatórios > Vendas > Apuramentos > Artigos',
    periods: ['Este Ano'],
    zsbmsId: '49',
    exportFileName: 'Artigos',
    formParams: { group_by_stores: '1', extension_model: 'ITEMS' },
    importFn: importArticleFile,
  },
  {
    key: 'abc_analysis',
    title: 'Análise ABC',
    zsbmsPath: 'Relatórios > Vendas > Rankings > Análise ABC Vendas',
    periods: ['Este Ano'],
    zsbmsId: '9',
    exportFileName: 'ABC_Vendas',
    formParams: { group_by_stores: '1', extension_model: 'ITEMS' },
    importFn: importABCFile,
  },
  {
    key: 'hourly_totals',
    title: 'Totais Apurados por Hora',
    zsbmsPath: 'Relatórios > Vendas > Horárias > Totais Apurados',
    periods: ['Este Ano'],
    extraRules: [
      'Agrupar por Data',
      'Agrupar por Loja e Zona',
      'Retirar LUPITA SEDE em Lojas',
      'Período: 30 minutos',
    ],
    zsbmsId: '70',
    exportFileName: 'Totais_Hora',
    formParams: { group_by_stores_zones: '3', options: '2' },
    importFn: importHourlyFile,
  },
];

// ─── Lookup Helpers ────────────────────────────────────────────────

/** Map for O(1) lookup by key */
export const REPORT_BY_KEY = new Map<ReportKey, ReportDefinition>(
  REPORT_REGISTRY.map(r => [r.key, r])
);

/** Get display-only metadata (safe to send to frontend) */
export function getDisplayRegistry(): { commonRules: string[]; reports: ReportDisplayInfo[] } {
  return {
    commonRules: COMMON_RULES,
    reports: REPORT_REGISTRY.map(r => ({
      key: r.key,
      title: r.title,
      zsbmsPath: r.zsbmsPath,
      periods: r.periods,
      extraRules: r.extraRules,
    })),
  };
}
