import * as XLSX from 'xlsx';
import path from 'path';

export interface ParsedSaleRow {
  store_id: string;
  date: string;
  day_of_week: string;
  num_tickets: number;
  avg_ticket: number;
  num_customers: number;
  avg_per_customer: number;
  qty_items: number;
  qty_per_ticket: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  target_gross: number;
  is_closed: boolean;
}

export interface ParseResult {
  rows: ParsedSaleRow[];
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
  // Handle European format (comma as decimal separator)
  const str = String(val).replace(/\s/g, '').replace('.', '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function toInt(val: any): number {
  return Math.round(toNumber(val));
}

export function parseXlsxFile(filePath: string): ParseResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays (raw data)
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const errors: string[] = [];
  const rows: ParsedSaleRow[] = [];
  const storesFound = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  // Validate we have enough rows
  if (rawData.length < 8) {
    errors.push('Ficheiro tem menos de 8 linhas — formato inválido');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Validate header row (row index 6 = Row 7 in Excel)
  const headerRow = rawData[6];
  if (!headerRow || !headerRow.some((h: any) => String(h || '').includes('Loja'))) {
    errors.push('Header não encontrado na linha 7 — formato do ficheiro pode ter mudado');
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString().split('T')[0];

  // Parse data rows starting from index 7 (Row 8 in Excel)
  for (let i = 7; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Stop at footer: col[0] is null/empty AND col[1] starts with "Total Global"
    if ((row[0] === null || row[0] === undefined || row[0] === '') &&
        row[1] && String(row[1]).startsWith('Total Global')) {
      break;
    }

    // Skip rows where store name is empty (footer area)
    const rawStoreName = row[0];
    if (!rawStoreName || String(rawStoreName).trim() === '') continue;

    const storeName = String(rawStoreName).trim();
    const storeId = resolveStoreId(storeName);
    storesFound.add(storeId);

    // Parse date
    let dateStr: string;
    const rawDate = row[1];
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().split('T')[0];
    } else if (typeof rawDate === 'number') {
      // Excel serial date
      const excelDate = XLSX.SSF.parse_date_code(rawDate);
      dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
    } else {
      dateStr = String(rawDate || '').trim();
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(`Linha ${i + 1}: Data inválida "${rawDate}"`);
      continue;
    }

    // Skip future dates
    if (dateStr > todayStr) continue;

    // Track date range
    if (!dateFrom || dateStr < dateFrom) dateFrom = dateStr;
    if (!dateTo || dateStr > dateTo) dateTo = dateStr;

    const numTickets = toInt(row[3]);
    const isClosed = numTickets === 0;

    rows.push({
      store_id: storeId,
      date: dateStr,
      day_of_week: String(row[2] || '').trim(),
      num_tickets: numTickets,
      avg_ticket: toNumber(row[4]),
      num_customers: toInt(row[5]),
      avg_per_customer: toNumber(row[6]),
      qty_items: toNumber(row[7]),  // Can be None/null when tickets=0
      qty_per_ticket: toNumber(row[8]),
      total_net: toNumber(row[10]),
      total_vat: toNumber(row[11]),
      total_gross: toNumber(row[12]),
      target_gross: toNumber(row[13]),
      is_closed: isClosed,
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
