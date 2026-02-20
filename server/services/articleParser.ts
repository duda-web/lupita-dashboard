import * as XLSX from 'xlsx';

export interface ParsedArticleRow {
  store_id: string;
  date_from: string;
  date_to: string;
  article_code: string;
  article_name: string;
  barcode: string;
  family: string;
  subfamily: string;
  qty_sold: number;
  revenue_net: number;
  revenue_gross: number;
}

export interface ArticleParseResult {
  rows: ParsedArticleRow[];
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

/**
 * Convert a date value to YYYY-MM-DD format.
 * Handles ISO dates (2025-01-01), dd-mm-yyyy, dd/mm/yyyy, and Excel serial numbers.
 */
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
 * Extract the report date range from the metadata rows (rows 0-4).
 * Supports two layouts:
 *   A) Single cell: "01-01-2025 a 31-12-2025"
 *   B) Separate cells: ["Datas:", "2025-01-01", "até", "2025-12-31"]
 */
function extractDateRange(rawData: any[][]): { dateFrom: string | null; dateTo: string | null } {
  // Scan first 5 rows
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;

    // Layout A: single cell with "dd-mm-yyyy a dd-mm-yyyy"
    for (const cell of row) {
      const s = String(cell || '');
      const match = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})\s*a\s*(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (match) {
        return {
          dateFrom: `${match[3]}-${match[2]}-${match[1]}`,
          dateTo: `${match[6]}-${match[5]}-${match[4]}`,
        };
      }
    }

    // Layout B: "Datas:" label, then date cells separated by "a" or "até"
    const label = String(row[1] || '').toLowerCase();
    if (label.includes('data')) {
      // Try cells 2-4: dateFrom, separator, dateTo
      const from = normaliseDateCell(row[2]);
      const to = normaliseDateCell(row[4]) || normaliseDateCell(row[3]);
      if (from && to) return { dateFrom: from, dateTo: to };
    }
  }

  return { dateFrom: null, dateTo: null };
}

export function parseArticleFile(filePath: string): ArticleParseResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const errors: string[] = [];
  const rows: ParsedArticleRow[] = [];
  const storesFound = new Set<string>();

  if (rawData.length < 7) {
    errors.push('Ficheiro tem menos de 7 linhas — formato inválido');
    return { rows, errors, dateFrom: null, dateTo: null, stores: [] };
  }

  // Extract date range from metadata rows
  const { dateFrom, dateTo } = extractDateRange(rawData);
  if (!dateFrom || !dateTo) {
    errors.push('Não foi possível extrair o intervalo de datas do ficheiro');
  }

  // Find header row — look for "Artigo" in rows 3-6
  let headerIdx = -1;
  for (let i = 3; i < Math.min(7, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.some((h: any) => String(h || '').includes('Artigo'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    errors.push('Header "Artigo" não encontrado — ficheiro pode não ser do tipo Artigos');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Dynamically map columns from header row
  const headerRow = rawData[headerIdx].map((h: any) => String(h || '').trim().toLowerCase());
  const colIdx = {
    loja: headerRow.findIndex((h: string) => h === 'loja'),
    data: headerRow.findIndex((h: string) => h === 'data'),
    codArtigo: headerRow.findIndex((h: string) => h.includes('cód') && h.includes('artigo')),
    artigo: headerRow.findIndex((h: string) => h === 'artigo'),
    codBarras: headerRow.findIndex((h: string) => h.includes('barras')),
    familia: headerRow.findIndex((h: string) => h.includes('famí') || h.includes('familia')),
    subfamilia: headerRow.findIndex((h: string) => h.includes('sub-famí') || h.includes('sub-familia')),
    qty: headerRow.findIndex((h: string) => h === 'qtd.' || h === 'qtd'),
    totalLiquido: headerRow.findIndex((h: string) => h.includes('líquido') || h.includes('liquido')),
    totalFinal: headerRow.findIndex((h: string) => h.includes('final')),
  };

  const hasDailyData = colIdx.data >= 0;

  // Loja is always col 0
  if (colIdx.loja === -1) colIdx.loja = 0;

  const dataStart = headerIdx + 1;

  for (let i = dataStart; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const col0 = String(row[colIdx.loja] || '').trim();

    // Skip subtotal rows: "Loja -" prefix or "Data -" prefix
    if (col0.startsWith('Loja -') || col0.startsWith('Data -')) continue;

    // Stop at footer: "Total Global" or empty store + "Total" in another col
    if (col0.startsWith('Total')) break;
    for (let c = 0; c < Math.min(3, row.length); c++) {
      if (String(row[c] || '').startsWith('Total Global')) {
        return { rows, errors, dateFrom, dateTo, stores: Array.from(storesFound) };
      }
    }

    // Skip empty store rows or company footer
    if (!row[colIdx.loja] || col0 === '') continue;
    if (col0.startsWith('NIF') || col0.startsWith('MPDF') || col0.includes('UNIPESSOAL')) continue;

    const articleCode = colIdx.codArtigo >= 0 ? String(row[colIdx.codArtigo] || '').trim() : '';
    const articleName = colIdx.artigo >= 0 ? String(row[colIdx.artigo] || '').trim() : '';

    // Skip rows without article code or name (subtotal/date rows)
    if (!articleCode || !articleName) continue;

    // Skip items starting with @
    if (articleName.startsWith('@')) continue;

    const revenueGross = colIdx.totalFinal >= 0 ? toNumber(row[colIdx.totalFinal]) : 0;

    // Skip items with zero revenue
    if (revenueGross === 0) continue;

    const storeId = resolveStoreId(col0);
    storesFound.add(storeId);

    // Use per-row date when "Data" column exists (daily granularity)
    let rowDateFrom = dateFrom || '';
    let rowDateTo = dateTo || '';
    if (hasDailyData) {
      const rowDate = normaliseDateCell(row[colIdx.data]);
      if (rowDate) {
        rowDateFrom = rowDate;
        rowDateTo = rowDate;
      } else {
        // Skip rows without a valid date in daily mode
        continue;
      }
    }

    rows.push({
      store_id: storeId,
      date_from: rowDateFrom,
      date_to: rowDateTo,
      article_code: articleCode,
      article_name: articleName,
      barcode: colIdx.codBarras >= 0 ? String(row[colIdx.codBarras] || '').trim() : '',
      family: colIdx.familia >= 0 ? String(row[colIdx.familia] || '').trim() : '',
      subfamily: colIdx.subfamilia >= 0 ? String(row[colIdx.subfamilia] || '').trim() : '',
      qty_sold: colIdx.qty >= 0 ? toNumber(row[colIdx.qty]) : 0,
      revenue_net: colIdx.totalLiquido >= 0 ? toNumber(row[colIdx.totalLiquido]) : 0,
      revenue_gross: revenueGross,
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
