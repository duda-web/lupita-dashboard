/**
 * ZSBMS PRO Automated Report Exporter
 *
 * Downloads the 5 required XLSX reports from ZSBMS PRO via its internal API.
 * Each report has specific form parameters verified by inspecting the actual DOM.
 *
 * API discovered by reverse-engineering the ZSBMS PRO web portal:
 *   - Backend: Django (v8.1.04.28)
 *   - Auth: Session-based (sessionid + csrftoken cookies)
 *   - Export: POST /reports/{id}/print/ with export_type=xls
 *
 * Column visibility is CLIENT-SIDE only (ag-grid). The server always exports
 * ALL columns regardless of column state — no column parameters needed.
 */

import fs from 'fs';
import path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const ZSBMS_BASE_URL = 'https://515449741.zsbmspro.com';
const LOGIN_URL = `${ZSBMS_BASE_URL}/user/login/`;

// Store IDs in ZSBMS PRO (SEDE id=3 is excluded)
const STORES = {
  alvalade: '35',
  cais_do_sodre: '2',
};

// Report IDs mapped from the ZSBMS PRO sidebar
const REPORTS = {
  full_clearance: { id: '48', name: 'Vendas_Completo' },
  zones: { id: '46', name: 'Zonas' },
  items: { id: '49', name: 'Artigos' },
  abc_analysis: { id: '9', name: 'ABC_Vendas' },
  hourly_totals: { id: '70', name: 'Totais_Hora' },
} as const;

type ReportKey = keyof typeof REPORTS;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ZsbmsCredentials {
  username: string;
  password: string;
}

interface ZsbmsSession {
  sessionId: string;
  csrfToken: string;
}

interface ExportOptions {
  dateFrom: string;    // YYYY-MM-DD
  dateTo: string;      // YYYY-MM-DD
  storeIds?: string[]; // default: both stores (excluding SEDE)
}

interface ExportResult {
  reportName: string;
  reportKey: ReportKey;
  filePath: string;
  size: number;
  success: boolean;
  error?: string;
}

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Login to ZSBMS PRO and obtain session cookies.
 *
 * Flow:
 * 1. GET /user/login/ to obtain initial CSRF token
 * 2. POST /user/login/ with credentials + CSRF token
 * 3. Extract sessionid and csrftoken from response cookies
 */
async function login(credentials: ZsbmsCredentials): Promise<ZsbmsSession> {
  // Step 1: Get the login page to obtain CSRF token
  const loginPageResponse = await fetch(LOGIN_URL, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'User-Agent': 'LupitaDashboard/1.0',
    },
  });

  const cookies = extractCookies(loginPageResponse);
  const csrfToken = cookies['csrftoken'];

  if (!csrfToken) {
    throw new Error('Failed to obtain CSRF token from login page');
  }

  // Step 2: POST login credentials
  const loginData = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    username: credentials.username,
    password: credentials.password,
    next: '/',
  });

  const loginResponse = await fetch(LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `csrftoken=${csrfToken}`,
      'Referer': LOGIN_URL,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: loginData.toString(),
  });

  const responseCookies = extractCookies(loginResponse);
  const sessionId = responseCookies['sessionid'];
  const newCsrfToken = responseCookies['csrftoken'] || csrfToken;

  if (!sessionId) {
    throw new Error('Login failed: no sessionid cookie received. Check credentials.');
  }

  console.log('[ZSBMS] Login successful');
  return { sessionId, csrfToken: newCsrfToken };
}

/**
 * Extract cookies from a fetch Response object.
 */
function extractCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = response.headers.getSetCookie?.() || [];

  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match) {
      cookies[match[1]] = match[2];
    }
  }

  return cookies;
}

// ─── Report-Specific Parameters ──────────────────────────────────────────────

/**
 * Build form data for a specific report.
 * Each report has verified parameters from DOM inspection.
 *
 * Common fields (all reports):
 *   csrfmiddlewaretoken, date_range, store_type='', stores=[35,2], export_type=xls, extra_info=''
 *
 * Report-specific:
 *   Full (48) & Zones (46): group_by_dates=1, group_by_stores=1
 *   Items (49): group_by_dates=1, group_by_stores=1, extension_model=ITEMS
 *   ABC (9): group_by_dates=1, group_by_stores=1, extension_model=ITEMS
 *   Hourly (70): group_by_dates=1, group_by_stores_zones=3, options=2
 */
function buildFormData(
  session: ZsbmsSession,
  reportKey: ReportKey,
  options: ExportOptions,
): URLSearchParams {
  const storeIds = options.storeIds || [STORES.alvalade, STORES.cais_do_sodre];
  const dateRange = `${options.dateFrom}   -   ${options.dateTo}`;

  const formData = new URLSearchParams();
  formData.append('csrfmiddlewaretoken', session.csrfToken);
  formData.append('date_range', dateRange);
  formData.append('group_by_dates', '1');
  formData.append('store_type', '');

  // Multiple stores: append each separately
  for (const storeId of storeIds) {
    formData.append('stores', storeId);
  }

  // Report-specific parameters
  switch (reportKey) {
    case 'full_clearance':
    case 'zones':
      // Base fields + group_by_stores
      formData.append('group_by_stores', '1');
      break;

    case 'items':
      // Base + group_by_stores + extension_model=ITEMS
      // families, groups, items: NOT sent (empty = all)
      // pivot_view: NOT sent (OFF)
      formData.append('group_by_stores', '1');
      formData.append('extension_model', 'ITEMS');
      break;

    case 'abc_analysis':
      // Base + group_by_stores + extension_model=ITEMS
      // families, groups, items: NOT sent (empty = all)
      formData.append('group_by_stores', '1');
      formData.append('extension_model', 'ITEMS');
      break;

    case 'hourly_totals':
      // NO group_by_stores — uses group_by_stores_zones instead
      // group_by_stores_zones: 0=none, 1=Store, 2=Zone, 3=Store and Zone
      // options: 1=1hour, 2=30min, 3=15min
      formData.append('group_by_stores_zones', '3'); // Store and Zone
      formData.append('options', '2'); // 30min intervals
      break;
  }

  formData.append('export_type', 'xls');
  formData.append('extra_info', '');

  return formData;
}

// ─── Report Export ───────────────────────────────────────────────────────────

/**
 * Export a single report from ZSBMS PRO as XLSX.
 */
async function exportReport(
  session: ZsbmsSession,
  reportKey: ReportKey,
  options: ExportOptions,
): Promise<Buffer> {
  const report = REPORTS[reportKey];
  const url = `${ZSBMS_BASE_URL}/reports/${report.id}/print/`;
  const formData = buildFormData(session, reportKey, options);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`,
      'Referer': `${ZSBMS_BASE_URL}/reports/${report.id}/`,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Export failed for report ${report.id} (${reportKey}): HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('spreadsheet') && !contentType.includes('excel')) {
    const text = await response.text();
    throw new Error(`Unexpected response type: ${contentType}. Body: ${text.substring(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Main Export Pipeline ────────────────────────────────────────────────────

/**
 * Export all 5 reports for a given date range.
 *
 * @param credentials - ZSBMS PRO login credentials
 * @param options - Date range and filters
 * @param outputDir - Directory to save XLSX files
 * @returns Array of export results
 */
export async function exportAllReports(
  credentials: ZsbmsCredentials,
  options: ExportOptions,
  outputDir: string,
): Promise<ExportResult[]> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Login
  console.log('[ZSBMS] Logging in...');
  const session = await login(credentials);

  const results: ExportResult[] = [];
  const reportEntries = Object.entries(REPORTS) as [ReportKey, typeof REPORTS[ReportKey]][];

  for (const [key, report] of reportEntries) {
    const fileName = `${report.name}_${options.dateFrom}_${options.dateTo}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    console.log(`[ZSBMS] Exporting ${report.name} (report ${report.id}, key=${key})...`);

    try {
      const buffer = await exportReport(session, key, options);
      fs.writeFileSync(filePath, buffer);

      const result: ExportResult = {
        reportName: report.name,
        reportKey: key,
        filePath,
        size: buffer.length,
        success: true,
      };
      results.push(result);
      console.log(`[ZSBMS] ✓ ${report.name}: ${(buffer.length / 1024).toFixed(1)} KB`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.push({
        reportName: report.name,
        reportKey: key,
        filePath,
        size: 0,
        success: false,
        error: errMsg,
      });
      console.error(`[ZSBMS] ✗ ${report.name}: ${errMsg}`);
    }

    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[ZSBMS] Done: ${successful}/${results.length} reports exported`);

  return results;
}

/**
 * Export reports for "this year" (Jan 1 to today).
 * This is the standard weekly export configuration.
 */
export async function exportThisYear(
  credentials: ZsbmsCredentials,
  outputDir?: string,
): Promise<ExportResult[]> {
  const now = new Date();
  const year = now.getFullYear();
  const dateFrom = `${year}-01-01`;
  const dateTo = now.toISOString().split('T')[0];

  const defaultOutputDir = outputDir || path.join(
    process.cwd(),
    'data',
    'zsbms-exports',
    dateTo,
  );

  return exportAllReports(
    credentials,
    { dateFrom, dateTo },
    defaultOutputDir,
  );
}

// ─── Exports for sync service ────────────────────────────────────────────────

export { login, extractCookies, REPORTS, STORES };
export type { ZsbmsCredentials, ZsbmsSession, ExportOptions, ExportResult, ReportKey };

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (require.main === module) {
  const username = process.env.ZSBMS_USERNAME;
  const password = process.env.ZSBMS_PASSWORD;

  if (!username || !password) {
    console.error('Usage: ZSBMS_USERNAME=xxx ZSBMS_PASSWORD=xxx npx tsx server/services/zsbmsExporter.ts');
    process.exit(1);
  }

  exportThisYear({ username, password })
    .then(results => {
      console.log('\nResults:');
      results.forEach(r => {
        console.log(`  ${r.success ? '✓' : '✗'} ${r.reportName}: ${r.success ? `${(r.size / 1024).toFixed(1)} KB → ${r.filePath}` : r.error}`);
      });
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
