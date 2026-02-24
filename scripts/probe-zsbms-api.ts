/**
 * ZSBMS API Probe Script
 *
 * Investigates the ZSBMS PRO web interface to discover
 * hidden JSON/AJAX endpoints for real-time data access.
 */

import { getSyncSettings } from '../server/db/queries';
import { decrypt } from '../server/services/encryption';

const ZSBMS_BASE_URL = 'https://515449741.zsbmspro.com';
const LOGIN_URL = `${ZSBMS_BASE_URL}/user/login/`;

// Report IDs to probe
const REPORT_IDS = [48, 46, 49, 9, 70];

function extractCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match) cookies[match[1]] = match[2];
  }
  return cookies;
}

async function login(username: string, password: string) {
  console.log('[Probe] Logging in...');

  const loginPage = await fetch(LOGIN_URL, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'LupitaDashboard/1.0' } });
  const cookies = extractCookies(loginPage);
  const csrfToken = cookies['csrftoken'];
  if (!csrfToken) throw new Error('No CSRF token');

  const loginData = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    username,
    password,
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

  if (!sessionId) throw new Error('Login failed');
  console.log('[Probe] ✓ Login successful');

  return { sessionId, csrfToken: newCsrfToken };
}

async function probe(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;

  async function tryEndpoint(url: string, method: string = 'GET', body?: string): Promise<{ status: number; contentType: string; bodyPreview: string; size: number }> {
    try {
      const headers: Record<string, string> = {
        'Cookie': cookieHeader,
        'User-Agent': 'LupitaDashboard/1.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/plain, */*',
      };
      if (method === 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['X-CSRFToken'] = session.csrfToken;
      }

      const resp = await fetch(url, { method, headers, body, redirect: 'manual' });
      const contentType = resp.headers.get('content-type') || 'unknown';
      const text = await resp.text();
      return {
        status: resp.status,
        contentType,
        bodyPreview: text.substring(0, 500),
        size: text.length,
      };
    } catch (err: any) {
      return { status: -1, contentType: 'error', bodyPreview: err.message, size: 0 };
    }
  }

  // 1. Probe the main reports page for links/patterns
  console.log('\n=== 1. Probing report view pages ===');
  for (const id of [48]) {
    const result = await tryEndpoint(`${ZSBMS_BASE_URL}/reports/${id}/`);
    console.log(`  GET /reports/${id}/ → ${result.status} (${result.contentType}, ${result.size} bytes)`);

    // Look for AJAX URLs in the HTML
    const ajaxPatterns = result.bodyPreview.match(/(?:url|ajax|fetch|api|data|endpoint)['":\s]+([^'">\s]+)/gi);
    if (ajaxPatterns) {
      console.log(`  Found patterns:`, ajaxPatterns.slice(0, 10));
    }

    // Look for JavaScript data loading URLs
    const jsUrls = result.bodyPreview.match(/["'](\/[^"']*(?:data|json|api|load|get|fetch)[^"']*?)["']/gi);
    if (jsUrls) {
      console.log(`  JS URLs found:`, jsUrls.slice(0, 10));
    }
  }

  // 2. Probe common Django REST / ag-grid patterns
  console.log('\n=== 2. Probing common API patterns ===');
  const probeUrls = [
    // Django REST Framework patterns
    '/api/',
    '/api/v1/',
    '/api/v2/',
    '/api/reports/',
    '/api/sales/',
    '/api/dashboard/',

    // ag-grid server-side data patterns
    '/reports/48/data/',
    '/reports/48/json/',
    '/reports/48/rows/',
    '/reports/48/load/',
    '/reports/46/data/',
    '/reports/49/data/',
    '/reports/70/data/',

    // Django common patterns
    '/dashboard/',
    '/dashboard/data/',
    '/dashboard/api/',
    '/sales/',
    '/sales/data/',
    '/data/',
    '/stats/',
    '/statistics/',

    // ZSBMS-specific guesses
    '/reports/data/',
    '/report/data/',
    '/apuramento/',
    '/vendas/',
  ];

  for (const urlPath of probeUrls) {
    const result = await tryEndpoint(`${ZSBMS_BASE_URL}${urlPath}`);
    const isJson = result.contentType.includes('json');
    const isHtml = result.contentType.includes('html');
    const marker = isJson ? '🟢 JSON!' : result.status === 200 ? '🟡 200' : '⚪';
    console.log(`  ${marker} GET ${urlPath} → ${result.status} (${result.contentType}, ${result.size}b)`);
    if (isJson) {
      console.log(`    Preview: ${result.bodyPreview.substring(0, 300)}`);
    }
  }

  // 3. Probe the report page with POST (like ag-grid server-side)
  console.log('\n=== 3. Probing POST data endpoints ===');
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-01-01`;
  const dateTo = now.toISOString().split('T')[0];
  const dateRange = `${dateFrom}   -   ${dateTo}`;

  // Try report 48 with different export_type values
  for (const exportType of ['json', 'csv', 'data', 'api', '']) {
    const formData = new URLSearchParams({
      csrfmiddlewaretoken: session.csrfToken,
      date_range: dateRange,
      group_by_dates: '1',
      store_type: '',
      export_type: exportType,
      extra_info: '',
    });
    formData.append('stores', '35');
    formData.append('stores', '2');

    const result = await tryEndpoint(
      `${ZSBMS_BASE_URL}/reports/48/print/`,
      'POST',
      formData.toString(),
    );
    const isJson = result.contentType.includes('json');
    const marker = isJson ? '🟢 JSON!' : '⚪';
    console.log(`  ${marker} POST /reports/48/print/ (export_type=${exportType || 'empty'}) → ${result.status} (${result.contentType}, ${result.size}b)`);
    if (isJson || (result.status === 200 && !result.contentType.includes('spreadsheet'))) {
      console.log(`    Preview: ${result.bodyPreview.substring(0, 300)}`);
    }
  }

  // 4. Check if /reports/48/ with AJAX header returns JSON
  console.log('\n=== 4. Probing with Accept: application/json ===');
  for (const id of REPORT_IDS) {
    const result = await tryEndpoint(`${ZSBMS_BASE_URL}/reports/${id}/`);
    const isJson = result.contentType.includes('json');
    const marker = isJson ? '🟢 JSON!' : '⚪';
    console.log(`  ${marker} GET /reports/${id}/ (XMLHttpRequest) → ${result.status} (${result.contentType}, ${result.size}b)`);
    if (isJson) {
      console.log(`    Preview: ${result.bodyPreview.substring(0, 300)}`);
    }
  }

  // 5. Try the report print endpoint without export_type (might return HTML with data)
  console.log('\n=== 5. Probing report print without export ===');
  {
    const formData = new URLSearchParams({
      csrfmiddlewaretoken: session.csrfToken,
      date_range: `${dateTo}   -   ${dateTo}`,
      group_by_dates: '1',
      group_by_stores: '1',
      store_type: '',
      extra_info: '',
    });
    formData.append('stores', '35');
    formData.append('stores', '2');

    const result = await tryEndpoint(
      `${ZSBMS_BASE_URL}/reports/48/print/`,
      'POST',
      formData.toString(),
    );
    console.log(`  POST /reports/48/print/ (no export_type, today only) → ${result.status} (${result.contentType}, ${result.size}b)`);
    // Check if response contains today's data in HTML
    if (result.bodyPreview.includes('524') || result.bodyPreview.includes('table')) {
      console.log(`  🟡 Might contain data! Preview: ${result.bodyPreview.substring(0, 500)}`);
    }
  }

  // 6. Look for home/dashboard endpoint
  console.log('\n=== 6. Probing home/root endpoints ===');
  const homeResult = await tryEndpoint(`${ZSBMS_BASE_URL}/`);
  console.log(`  GET / → ${homeResult.status} (${homeResult.contentType}, ${homeResult.size}b)`);

  // Look for data patterns in the home page
  const dataMatches = homeResult.bodyPreview.match(/(?:var\s+\w+\s*=|data[_-]url|api[_-]url|endpoint)\s*["'][^"']+["']/gi);
  if (dataMatches) {
    console.log(`  Data patterns found:`, dataMatches.slice(0, 10));
  }
}

async function main() {
  // Get credentials from DB
  const settings = getSyncSettings();
  if (!settings?.zsbms_username || !settings?.zsbms_password_encrypted) {
    console.error('No ZSBMS credentials configured');
    process.exit(1);
  }

  const password = decrypt(settings.zsbms_password_encrypted);
  const session = await login(settings.zsbms_username, password);

  await probe(session);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
