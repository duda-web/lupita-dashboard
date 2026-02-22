import * as XLSX from 'xlsx';

export interface ParsedHourlyRow {
  store_id: string;
  date: string;
  zone: string;
  time_slot: string;
  num_tickets: number;
  num_customers: number;
  avg_ticket: number;
  avg_per_customer: number;
  total_net: number;
  total_gross: number;
}

export interface HourlyParseResult {
  rows: ParsedHourlyRow[];
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

function parseTimeSlot(val: any): string | null {
  if (val === null || val === undefined) return null;

  // If it's a number (Excel time serial), convert to HH:MM
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const str = String(val).trim();
  // Already in HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  return null;
}

export function parseHourlyFile(filePath: string): HourlyParseResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const errors: string[] = [];
  const rows: ParsedHourlyRow[] = [];
  const storesFound = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (rawData.length < 8) {
    errors.push('Ficheiro tem menos de 8 linhas — formato inválido');
    return { rows, errors, dateFrom, dateTo, stores: [] };
  }

  // Find header row — look for "Hora" in rows 4-8
  let headerIdx = -1;
  for (let hi = 4; hi <= 8 && hi < rawData.length; hi++) {
    const headerRow = rawData[hi];
    if (!headerRow) continue;
    const headerStr = headerRow.map((h: any) => String(h || '')).join(' ');
    if (headerStr.includes('Hora')) {
      headerIdx = hi;
      break;
    }
  }

  if (headerIdx === -1) {
    // Default to row 6 (index 6 = Excel row 7)
    headerIdx = 6;
    errors.push('Header "Hora" não encontrado — usando linha 7 por defeito');
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString().split('T')[0];

  // Parse data rows (starting after header)
  // Columns: [0]=Loja, [1]=Zona, [2]=Data, [3]=Hora, [4]=Nº Tickets, [5]=Nº Pessoas,
  //           [6]=Ticket Médio, [7]=Pessoa Média, [8]=Total Líq., [9]=Total Final
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const col0 = String(row[0] || '').trim();

    // Skip subtotal rows
    if (col0.startsWith('Loja -') || col0.startsWith('Zona -') ||
        col0.startsWith('Data -') || col0.startsWith('Hora -')) continue;

    // Stop at footer
    if (col0.startsWith('Total')) break;
    if (col0 === '' && row[1] && String(row[1]).startsWith('Total')) break;

    // Skip empty or footer-like rows
    if (!row[0] || col0 === '') continue;
    if (col0.startsWith('NIF') || col0.startsWith('MPDF') || col0.includes('UNIPESSOAL')) continue;

    // Need all 4 key columns: store, zone, date, hour
    const storeName = col0;
    const rawZone = String(row[1] || '').trim();
    const rawDate = row[2];
    const rawHour = row[3];

    // Skip if zone or hour is missing/empty (likely a subtotal)
    if (!rawZone || rawZone === '' || rawZone === '-') continue;
    if (rawHour === null || rawHour === undefined) continue;

    const storeId = resolveStoreId(storeName);
    storesFound.add(storeId);

    // Parse date
    let dateStr: string;
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().split('T')[0];
    } else if (typeof rawDate === 'number') {
      const excelDate = XLSX.SSF.parse_date_code(rawDate);
      dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
    } else {
      dateStr = String(rawDate || '').trim();
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (dateStr > todayStr) continue;

    // Parse time slot
    const timeSlot = parseTimeSlot(rawHour);
    if (!timeSlot) continue;

    // Track date range
    if (!dateFrom || dateStr < dateFrom) dateFrom = dateStr;
    if (!dateTo || dateStr > dateTo) dateTo = dateStr;

    rows.push({
      store_id: storeId,
      date: dateStr,
      zone: normalizeZone(rawZone),
      time_slot: timeSlot,
      num_tickets: Math.round(toNumber(row[4])),
      num_customers: Math.round(toNumber(row[5])),
      avg_ticket: toNumber(row[6]),
      avg_per_customer: toNumber(row[7]),
      total_net: toNumber(row[8]),
      total_gross: toNumber(row[9]),
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
