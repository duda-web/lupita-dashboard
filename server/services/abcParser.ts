import * as XLSX from 'xlsx';

export interface ParsedABCRow {
  store_id: string;
  date: string;
  article_code: string;
  article_name: string;
  barcode: string;
  qty: number;
  qty_pct: number;
  value_net: number;
  value_gross: number;
  value_pct: number;
  value_cumulative: number;
  cumulative_pct: number;
  ranking: number;
  abc_class: string;
  is_excluded: boolean;
  exclude_reason: string | null;
}

export interface ABCParseResult {
  rows: ParsedABCRow[];
  errors: string[];
  dateFrom: string | null;
  dateTo: string | null;
  stores: string[];
}

const STORE_MAP: Record<string, string> = {
  'Lupita Pizza - Cais do Sodre (1)': 'cais_do_sodre',
  'Lupita Pizza - Alvalade (2)': 'alvalade',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveStoreId(rawName: string): string {
  return STORE_MAP[rawName] || slugify(rawName);
}

function toNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/\s/g, '').replace('.', '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function normaliseDateCell(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  // ISO: 2025-01-01
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Excel serial number
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const d = new Date((val - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Determine if a row should be excluded from ABC analysis and why.
 */
function getExcludeReason(articleName: string, articleCode: string, qty: number, valueGross: number): string | null {
  // Modifiers start with @
  if (articleName.startsWith('@')) return 'modifier';
  // System fees have negative codes (e.g. "-996")
  if (articleCode.startsWith('-')) return 'system_fee';
  // Zero sales
  if (valueGross === 0 && qty === 0) return 'zero_sales';
  // Has quantity but no price
  if (valueGross === 0 && qty > 0) return 'no_price';
  return null;
}

/**
 * Calculate ABC class from cumulative percentage.
 * A: top 70%, B: 70-90%, C: bottom 10%
 */
function calcABCClass(cumulativePct: number): string {
  if (cumulativePct <= 0.70) return 'A';
  if (cumulativePct <= 0.90) return 'B';
  return 'C';
}

/**
 * Detect whether a file is an "Análise ABC Vendas" file.
 * Checks the first few rows for the identifier string.
 */
export function isABCFile(rawData: any[][]): boolean {
  for (let i = 0; i < Math.min(3, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    for (const cell of row) {
      const s = String(cell || '');
      if (s.includes('Análise ABC Vendas') || s.includes('Analise ABC Vendas')) {
        return true;
      }
    }
  }
  return false;
}

export function parseABCFile(filePath: string): ABCParseResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const errors: string[] = [];
  const rows: ParsedABCRow[] = [];
  const storesFound = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (rawData.length < 7) {
    errors.push('Ficheiro ABC tem menos de 7 linhas — formato inválido');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Extract date range from metadata rows (rows 0-4)
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    for (const cell of row) {
      const s = String(cell || '');
      // "dd-mm-yyyy a dd-mm-yyyy" pattern
      const match = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})\s*a\s*(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (match) {
        dateFrom = `${match[3]}-${match[2]}-${match[1]}`;
        dateTo = `${match[6]}-${match[5]}-${match[4]}`;
        break;
      }
    }
    if (dateFrom) break;

    // Layout B: "Datas:" label
    const label = String(row[1] || '').toLowerCase();
    if (label.includes('data')) {
      const from = normaliseDateCell(row[2]);
      const to = normaliseDateCell(row[4]) || normaliseDateCell(row[3]);
      if (from && to) {
        dateFrom = from;
        dateTo = to;
        break;
      }
    }
  }

  if (!dateFrom || !dateTo) {
    errors.push('Não foi possível extrair o intervalo de datas do ficheiro ABC');
  }

  // Find header row — look for "Artigo" in rows 3-8
  let headerIdx = -1;
  for (let i = 3; i < Math.min(9, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    const headerStr = row.map((h: any) => String(h || '')).join(' ');
    if (headerStr.includes('Artigo') && (headerStr.includes('Ranking') || headerStr.includes('ABC'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback: look for any row with "Artigo"
    for (let i = 3; i < Math.min(9, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.some((h: any) => String(h || '').includes('Artigo'))) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) {
    errors.push('Header não encontrado no ficheiro ABC');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Map columns dynamically
  const headerRow = rawData[headerIdx].map((h: any) => String(h || '').trim().toLowerCase());
  const colIdx = {
    loja: headerRow.findIndex((h: string) => h === 'loja'),
    data: headerRow.findIndex((h: string) => h === 'data'),
    codArtigo: headerRow.findIndex((h: string) => h.includes('cód') && h.includes('artigo')),
    artigo: headerRow.findIndex((h: string) => h === 'artigo'),
    codBarras: headerRow.findIndex((h: string) => h.includes('barras')),
    qty: headerRow.findIndex((h: string) => h === 'qtd.' || h === 'qtd'),
    qtyPct: -1,
    valorLiquido: -1,
    valorFinal: -1,
    valorPct: -1,
    valorAcumulado: -1,
    pctAcumulado: -1,
    ranking: headerRow.findIndex((h: string) => h.includes('ranking')),
    abcClass: headerRow.findIndex((h: string) => h === 'abc'),
  };

  // Find percentage / value columns by pattern
  // First pass: gather all "valor" columns for disambiguation
  const valorColumns: { idx: number; header: string }[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c];
    if ((h.includes('qtd') || h.includes('quantidade')) && h.includes('%')) colIdx.qtyPct = c;
    if (h.includes('valor') || h.includes('%valor') || h.includes('acumulado')) {
      valorColumns.push({ idx: c, header: h });
    }
    if (h.includes('ranking')) colIdx.ranking = c;
  }

  for (const { idx, header: h } of valorColumns) {
    // "Valor Líq." / "Valor Líquido" / "Val. Líq." — net value
    if ((h.includes('líq') || h.includes('liq')) && !h.includes('%') && !h.includes('acum')) {
      colIdx.valorLiquido = idx;
    }
    // "Valor Final" / "Valor Bruto" — gross value
    else if ((h.includes('final') || h.includes('bruto')) && !h.includes('%') && !h.includes('acum')) {
      colIdx.valorFinal = idx;
    }
    // "%Valor" / "% Valor" — value percentage
    else if (h.includes('%') && h.includes('valor') && !h.includes('acum')) {
      colIdx.valorPct = idx;
    }
    // "Valor Acumulado" — cumulative value (no %)
    else if (h.includes('acumulado') && !h.includes('%')) {
      colIdx.valorAcumulado = idx;
    }
    // "%Acumulado" / "% Acumulado" — cumulative percentage
    else if (h.includes('acumulado') && h.includes('%')) {
      colIdx.pctAcumulado = idx;
    }
    // Plain "Valor" — if no gross column found yet, this is the gross value
    else if (h === 'valor' && colIdx.valorFinal === -1) {
      colIdx.valorFinal = idx;
    }
  }

  // Loja defaults to col 0
  if (colIdx.loja === -1) colIdx.loja = 0;

  const dataStart = headerIdx + 1;
  let currentStore = '';

  for (let i = dataStart; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const col0 = String(row[colIdx.loja] || '').trim();

    // Skip subtotal rows
    if (col0.startsWith('Loja -') || col0.startsWith('Data -')) continue;

    // Stop at footer
    if (col0.startsWith('Total Global') || col0.startsWith('Total global')) break;
    for (let c = 0; c < Math.min(3, row.length); c++) {
      const cell = String(row[c] || '');
      if (cell.startsWith('Total Global') || cell.startsWith('Total global')) {
        return { rows, errors, dateFrom, dateTo, stores: Array.from(storesFound) };
      }
    }

    // Skip empty or company footer
    if (!row[colIdx.loja] || col0 === '') continue;
    if (col0.startsWith('NIF') || col0.startsWith('MPDF') || col0.includes('UNIPESSOAL')) continue;

    // Resolve store
    const storeId = resolveStoreId(col0);
    if (storeId) {
      currentStore = storeId;
      storesFound.add(storeId);
    }

    // Article code and name
    const articleCode = colIdx.codArtigo >= 0 ? String(row[colIdx.codArtigo] || '').trim() : '';
    const articleName = colIdx.artigo >= 0 ? String(row[colIdx.artigo] || '').trim() : '';

    // Skip rows without article code or name (date/subtotal rows)
    if (!articleCode || !articleName) continue;

    // Parse date
    let dateStr: string | null = null;
    if (colIdx.data >= 0) {
      dateStr = normaliseDateCell(row[colIdx.data]);
    }
    if (!dateStr) continue; // ABC file must have daily data

    // Track date range
    if (!dateFrom || dateStr < dateFrom) dateFrom = dateStr;
    if (!dateTo || dateStr > dateTo) dateTo = dateStr;

    const qty = colIdx.qty >= 0 ? toNumber(row[colIdx.qty]) : 0;
    const qtyPct = colIdx.qtyPct >= 0 ? toNumber(row[colIdx.qtyPct]) : 0;
    const valueNet = colIdx.valorLiquido >= 0 ? toNumber(row[colIdx.valorLiquido]) : 0;
    const valueGross = colIdx.valorFinal >= 0 ? toNumber(row[colIdx.valorFinal]) : 0;
    const valuePct = colIdx.valorPct >= 0 ? toNumber(row[colIdx.valorPct]) : 0;
    const valueCumulative = colIdx.valorAcumulado >= 0 ? toNumber(row[colIdx.valorAcumulado]) : 0;
    const cumulativePct = colIdx.pctAcumulado >= 0 ? toNumber(row[colIdx.pctAcumulado]) : 0;
    const ranking = colIdx.ranking >= 0 ? Math.round(toNumber(row[colIdx.ranking])) : 0;
    const fileAbcClass = colIdx.abcClass >= 0 ? String(row[colIdx.abcClass] || '').trim().toUpperCase() : '';

    // Check for exclusion
    const excludeReason = getExcludeReason(articleName, articleCode, qty, valueGross);

    // Use file's ABC class if present, otherwise calculate from cumulative percentage
    // The cumulative_pct in the file is already a decimal (e.g. 0.80 = 80%)
    // But some files have it as percentage (80.00) — normalise
    let normCumulPct = cumulativePct;
    if (normCumulPct > 1) normCumulPct = normCumulPct / 100;

    const abcClass = excludeReason
      ? ''
      : (fileAbcClass || calcABCClass(normCumulPct));

    rows.push({
      store_id: currentStore,
      date: dateStr,
      article_code: articleCode,
      article_name: articleName,
      barcode: colIdx.codBarras >= 0 ? String(row[colIdx.codBarras] || '').trim() : '',
      qty,
      qty_pct: qtyPct > 1 ? qtyPct / 100 : qtyPct,
      value_net: valueNet,
      value_gross: valueGross,
      value_pct: valuePct > 1 ? valuePct / 100 : valuePct,
      value_cumulative: valueCumulative,
      cumulative_pct: normCumulPct,
      ranking,
      abc_class: abcClass,
      is_excluded: !!excludeReason,
      exclude_reason: excludeReason,
    });
  }

  return {
    rows,
    errors,
    dateFrom,
    dateTo,
    stores: Array.from(storesFound),
  };
}
