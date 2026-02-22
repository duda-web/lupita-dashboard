import { upsertDailySale, upsertZoneSale, upsertArticleSale, upsertABCDaily, upsertHourlySale, logImport } from '../db/queries';
import { parseXlsxFile, ParseResult } from './xlsxParser';
import { parseZoneFile, ZoneParseResult } from './zoneParser';
import { parseArticleFile, ArticleParseResult } from './articleParser';
import { parseABCFile, ABCParseResult, isABCFile } from './abcParser';
import { parseHourlyFile, HourlyParseResult } from './hourlyParser';
import * as XLSX from 'xlsx';
import path from 'path';

export interface ImportResult {
  filename: string;
  fileType: 'apuramento' | 'zonas' | 'artigos' | 'abc' | 'horario' | 'unknown';
  dateFrom: string | null;
  dateTo: string | null;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
  stores: string[];
}

export type FileType = 'apuramento' | 'zonas' | 'artigos' | 'abc' | 'horario' | 'unknown';

/** Auto-detect whether an xlsx file is "Apuramento Completo", "Zonas", "Artigos", or "ABC" */
export function detectFileType(filePath: string): FileType {
  const filename = path.basename(filePath).toLowerCase();

  // Check filename first
  if (filename.includes('abc')) return 'abc';
  if (filename.includes('hora')) return 'horario';
  if (filename.includes('zona') || filename.includes('zonas')) return 'zonas';
  if (filename.includes('artigo') || filename.includes('artigos')) return 'artigos';

  // Peek at the content to detect
  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    // Check if it's an ABC file first (before other checks)
    if (isABCFile(rawData)) return 'abc';

    // Check multiple possible header rows (index 4-6)
    for (let hi = 4; hi <= 6 && hi < rawData.length; hi++) {
      const headerRow = rawData[hi];
      if (!headerRow) continue;
      const headerStr = headerRow.map((h: any) => String(h || '')).join(' ');

      // Article files have "Cod. Artigo" or "Artigo" + "Familia" columns
      if (headerStr.includes('Artigo') && headerStr.includes('Familia')) return 'artigos';
      // Hourly files have "Hora" column alongside "Zona"
      if (headerStr.includes('Hora') && headerStr.includes('Zona')) return 'horario';
      // Zone files have "Zona" column (but NOT "Hora")
      if (headerStr.includes('Zona')) return 'zonas';
      // Apuramento Completo has "Tickets" or "Ticket"
      if (headerStr.includes('Tickets') || headerStr.includes('Ticket')) return 'apuramento';
    }
  } catch {
    // Fall through to unknown
  }

  // Default: assume apuramento (backward-compatible)
  return 'apuramento';
}

export function importXlsxFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  const parseResult: ParseResult = parseXlsxFile(filePath);

  let recordsInserted = 0;
  let recordsUpdated = 0;
  const errors = [...parseResult.errors];

  for (const row of parseResult.rows) {
    try {
      const result = upsertDailySale(row);
      if (result === 'inserted') recordsInserted++;
      else recordsUpdated++;
    } catch (err: any) {
      errors.push(`Erro ao importar ${row.store_id} ${row.date}: ${err.message}`);
    }
  }

  // Log the import
  logImport({
    filename,
    date_from: parseResult.dateFrom,
    date_to: parseResult.dateTo,
    records_inserted: recordsInserted,
    records_updated: recordsUpdated,
    errors: errors.length > 0 ? errors : null,
    import_type: 'financial',
  });

  return {
    filename,
    fileType: 'apuramento',
    dateFrom: parseResult.dateFrom,
    dateTo: parseResult.dateTo,
    recordsInserted,
    recordsUpdated,
    errors,
    stores: parseResult.stores,
  };
}

export function importZoneFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  const parseResult: ZoneParseResult = parseZoneFile(filePath);

  let recordsInserted = 0;
  let recordsUpdated = 0;
  const errors = [...parseResult.errors];

  for (const row of parseResult.rows) {
    try {
      const result = upsertZoneSale(row);
      if (result === 'inserted') recordsInserted++;
      else recordsUpdated++;
    } catch (err: any) {
      errors.push(`Erro ao importar zona ${row.zone} ${row.store_id} ${row.date}: ${err.message}`);
    }
  }

  logImport({
    filename,
    date_from: parseResult.dateFrom,
    date_to: parseResult.dateTo,
    records_inserted: recordsInserted,
    records_updated: recordsUpdated,
    errors: errors.length > 0 ? errors : null,
    import_type: 'zones',
  });

  return {
    filename,
    fileType: 'zonas',
    dateFrom: parseResult.dateFrom,
    dateTo: parseResult.dateTo,
    recordsInserted,
    recordsUpdated,
    errors,
    stores: parseResult.stores,
  };
}

export function importArticleFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  const parseResult: ArticleParseResult = parseArticleFile(filePath);

  let recordsInserted = 0;
  let recordsUpdated = 0;
  const errors = [...parseResult.errors];

  // Aggregate rows by (store_id, date_from, date_to, article_code)
  // Files with "Agrupar p/ Data" have one row per day per article — we need to sum them
  const aggregated = new Map<string, typeof parseResult.rows[0]>();
  for (const row of parseResult.rows) {
    const key = `${row.store_id}|${row.date_from}|${row.date_to}|${row.article_code}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.qty_sold += row.qty_sold;
      existing.revenue_net += row.revenue_net;
      existing.revenue_gross += row.revenue_gross;
    } else {
      aggregated.set(key, { ...row });
    }
  }

  for (const row of aggregated.values()) {
    try {
      const result = upsertArticleSale(row);
      if (result === 'inserted') recordsInserted++;
      else recordsUpdated++;
    } catch (err: any) {
      errors.push(`Erro ao importar artigo ${row.article_name} ${row.store_id}: ${err.message}`);
    }
  }

  logImport({
    filename,
    date_from: parseResult.dateFrom,
    date_to: parseResult.dateTo,
    records_inserted: recordsInserted,
    records_updated: recordsUpdated,
    errors: errors.length > 0 ? errors : null,
    import_type: 'articles',
  });

  return {
    filename,
    fileType: 'artigos',
    dateFrom: parseResult.dateFrom,
    dateTo: parseResult.dateTo,
    recordsInserted,
    recordsUpdated,
    errors,
    stores: parseResult.stores,
  };
}

export function importABCFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  const parseResult: ABCParseResult = parseABCFile(filePath);

  let recordsInserted = 0;
  let recordsUpdated = 0;
  const errors = [...parseResult.errors];

  for (const row of parseResult.rows) {
    try {
      const result = upsertABCDaily(row);
      if (result === 'inserted') recordsInserted++;
      else recordsUpdated++;
    } catch (err: any) {
      errors.push(`Erro ao importar ABC ${row.article_name} ${row.store_id} ${row.date}: ${err.message}`);
    }
  }

  logImport({
    filename,
    date_from: parseResult.dateFrom,
    date_to: parseResult.dateTo,
    records_inserted: recordsInserted,
    records_updated: recordsUpdated,
    errors: errors.length > 0 ? errors : null,
    import_type: 'abc',
  });

  return {
    filename,
    fileType: 'abc',
    dateFrom: parseResult.dateFrom,
    dateTo: parseResult.dateTo,
    recordsInserted,
    recordsUpdated,
    errors,
    stores: parseResult.stores,
  };
}

export function importHourlyFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  const parseResult: HourlyParseResult = parseHourlyFile(filePath);

  let recordsInserted = 0;
  let recordsUpdated = 0;
  const errors = [...parseResult.errors];

  for (const row of parseResult.rows) {
    try {
      const result = upsertHourlySale(row);
      if (result === 'inserted') recordsInserted++;
      else recordsUpdated++;
    } catch (err: any) {
      errors.push(`Erro ao importar horário ${row.store_id} ${row.date} ${row.time_slot}: ${err.message}`);
    }
  }

  logImport({
    filename,
    date_from: parseResult.dateFrom,
    date_to: parseResult.dateTo,
    records_inserted: recordsInserted,
    records_updated: recordsUpdated,
    errors: errors.length > 0 ? errors : null,
    import_type: 'hourly',
  });

  return {
    filename,
    fileType: 'horario',
    dateFrom: parseResult.dateFrom,
    dateTo: parseResult.dateTo,
    recordsInserted,
    recordsUpdated,
    errors,
    stores: parseResult.stores,
  };
}
