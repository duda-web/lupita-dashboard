/**
 * ZSBMS PRO Automated Report Exporter
 *
 * Downloads XLSX reports from ZSBMS PRO via its internal API.
 * Report definitions come from the central reportRegistry.
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
import { REPORT_REGISTRY, REPORT_BY_KEY, type ReportKey } from '../reportRegistry';

// ─── Configuration ───────────────────────────────────────────────────────────

const ZSBMS_BASE_URL = 'https://515449741.zsbmspro.com';
const LOGIN_URL = `${ZSBMS_BASE_URL}/user/login/`;

// Store IDs in ZSBMS PRO (SEDE id=3 is excluded)
const STORES = {
  alvalade: '35',
  cais_do_sodre: '2',
};

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
 * Report-specific parameters come from the registry's formParams.
 *
 * Common fields (all reports):
 *   csrfmiddlewaretoken, date_range, store_type='', stores=[35,2], export_type=xls, extra_info=''
 */
function buildFormData(
  session: ZsbmsSession,
  reportKey: ReportKey,
  options: ExportOptions,
): URLSearchParams {
  const report = REPORT_BY_KEY.get(reportKey);
  if (!report) throw new Error(`Unknown report key: ${reportKey}`);

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

  // Report-specific parameters from registry (data-driven, no switch)
  for (const [param, value] of Object.entries(report.formParams)) {
    formData.append(param, value);
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
  const report = REPORT_BY_KEY.get(reportKey)!;
  const url = `${ZSBMS_BASE_URL}/reports/${report.zsbmsId}/print/`;
  const formData = buildFormData(session, reportKey, options);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`,
      'Referer': `${ZSBMS_BASE_URL}/reports/${report.zsbmsId}/`,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Export failed for report ${report.zsbmsId} (${reportKey}): HTTP ${response.status}`);
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
 * Export all reports defined in the registry for a given date range.
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

  for (const report of REPORT_REGISTRY) {
    const fileName = `${report.exportFileName}_${options.dateFrom}_${options.dateTo}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    console.log(`[ZSBMS] Exporting ${report.exportFileName} (report ${report.zsbmsId}, key=${report.key})...`);

    try {
      const buffer = await exportReport(session, report.key, options);
      fs.writeFileSync(filePath, buffer);

      const result: ExportResult = {
        reportName: report.exportFileName,
        reportKey: report.key,
        filePath,
        size: buffer.length,
        success: true,
      };
      results.push(result);
      console.log(`[ZSBMS] ✓ ${report.exportFileName}: ${(buffer.length / 1024).toFixed(1)} KB`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.push({
        reportName: report.exportFileName,
        reportKey: report.key,
        filePath,
        size: 0,
        success: false,
        error: errMsg,
      });
      console.error(`[ZSBMS] ✗ ${report.exportFileName}: ${errMsg}`);
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

export { login, extractCookies, STORES };
export type { ZsbmsCredentials, ZsbmsSession, ExportOptions, ExportResult };

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
