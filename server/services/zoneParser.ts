import * as XLSX from 'xlsx';

export interface ParsedZoneRow {
  store_id: string;
  date: string;
  day_of_week: string;
  zone: string;
  total_net: number;
  total_gross: number;
}

export interface ZoneParseResult {
  rows: ParsedZoneRow[];
  errors: string[];
  dateFrom: string | null;
  dateTo: string | null;
  stores: string[];
}

const STORE_MAP: Record<string, string> = {
  'Lupita Pizza - Cais do Sodre (1)': 'cais_do_sodre',
  'Lupita Pizza - Alvalade (2)': 'alvalade',
};

const ZONE_NORMALIZE: Record<string, string> = {
  DELIVERY: 'Delivery',
  Delivery: 'Delivery',
  delivery: 'Delivery',
  Sala: 'Sala',
  SALA: 'Sala',
  sala: 'Sala',
  Takeaway: 'Takeaway',
  TAKEAWAY: 'Takeaway',
  takeaway: 'Takeaway',
  Espera: 'Espera',
  ESPERA: 'Espera',
  espera: 'Espera',
  Eventos: 'Eventos',
  EVENTOS: 'Eventos',
  eventos: 'Eventos',
};

function normalizeZone(raw: string): string {
  const trimmed = (raw || '').trim();
  if (trimmed === '' || trimmed === '-') return 'Outros';
  return ZONE_NORMALIZE[trimmed] || trimmed;
}

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

export function parseZoneFile(filePath: string): ZoneParseResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const errors: string[] = [];
  const rows: ParsedZoneRow[] = [];
  const storesFound = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (rawData.length < 8) {
    errors.push('Ficheiro tem menos de 8 linhas — formato inválido');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Validate header row (row index 6 = Row 7 in Excel)
  const headerRow = rawData[6];
  if (!headerRow || !headerRow.some((h: any) => String(h || '').includes('Zona'))) {
    errors.push('Header "Zona" não encontrado na linha 7 — ficheiro pode não ser do tipo Zonas');
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString().split('T')[0];

  // Column layout: 0=Loja, 1=Data, 2=Dia, 3=Total Liquido, 4=Total Final, 5=Zona
  for (let i = 7; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const col0 = String(row[0] || '').trim();

    // Skip subtotal rows: "Loja -" or "Zona -"
    if (col0.startsWith('Loja -') || col0.startsWith('Zona -')) continue;

    // Stop at footer: "Total Global" or empty store + "Total Global" in col 1
    if (col0.startsWith('Total')) break;
    if (col0 === '' && row[1] && String(row[1]).startsWith('Total')) break;

    // Skip empty store rows (footer area / company info)
    if (!row[0] || col0 === '') continue;

    // Skip rows that look like company footer (NIF, address, etc.)
    if (col0.startsWith('NIF') || col0.startsWith('MPDF') || col0.includes('UNIPESSOAL')) continue;

    const storeName = col0;
    const storeId = resolveStoreId(storeName);
    storesFound.add(storeId);

    // Parse date
    let dateStr: string;
    const rawDate = row[1];
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().split('T')[0];
    } else if (typeof rawDate === 'number') {
      const excelDate = XLSX.SSF.parse_date_code(rawDate);
      dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
    } else {
      dateStr = String(rawDate || '').trim();
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Not a data row (could be footer/header remnant)
      continue;
    }

    // Skip future dates
    if (dateStr > todayStr) continue;

    // Track date range
    if (!dateFrom || dateStr < dateFrom) dateFrom = dateStr;
    if (!dateTo || dateStr > dateTo) dateTo = dateStr;

    rows.push({
      store_id: storeId,
      date: dateStr,
      day_of_week: String(row[2] || '').trim(),
      total_net: toNumber(row[3]),
      total_gross: toNumber(row[4]),
      zone: normalizeZone(String(row[5] || '')),
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
