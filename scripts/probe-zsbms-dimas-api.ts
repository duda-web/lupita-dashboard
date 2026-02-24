/**
 * ZSBMS Dimas API Investigation
 * Found /dimas/api/ and /dimas/api/frontend/ endpoints in the React bundle!
 * Also probe interesting reports we haven't tried.
 */

import { getSyncSettings } from '../server/db/queries';
import { decrypt } from '../server/services/encryption';

const ZSBMS_BASE_URL = 'https://515449741.zsbmspro.com';
const LOGIN_URL = `${ZSBMS_BASE_URL}/user/login/`;

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
  const loginPage = await fetch(LOGIN_URL, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'LupitaDashboard/1.0' } });
  const cookies = extractCookies(loginPage);
  const csrfToken = cookies['csrftoken'];
  if (!csrfToken) throw new Error('No CSRF token');
  const loginData = new URLSearchParams({ csrfmiddlewaretoken: csrfToken, username, password, next: '/' });
  const loginResponse = await fetch(LOGIN_URL, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': `csrftoken=${csrfToken}`, 'Referer': LOGIN_URL, 'User-Agent': 'LupitaDashboard/1.0' },
    body: loginData.toString(),
  });
  const responseCookies = extractCookies(loginResponse);
  const sessionId = responseCookies['sessionid'];
  if (!sessionId) throw new Error('Login failed');
  console.log('[Probe] ✓ Login OK\n');
  return { sessionId, csrfToken: responseCookies['csrftoken'] || csrfToken };
}

async function tryGet(session: { sessionId: string; csrfToken: string }, path: string, label?: string): Promise<{ status: number; ct: string; body: string }> {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  try {
    const resp = await fetch(`${ZSBMS_BASE_URL}${path}`, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'LupitaDashboard/1.0',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/html, */*',
      },
      redirect: 'manual',
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const body = await resp.text();
    const isJson = ct.includes('json');
    const tag = resp.status === 200 ? (isJson ? '🟢 JSON' : '🟡 200') :
                resp.status === 302 ? '↩️' :
                resp.status === 403 ? '🔒 403' :
                resp.status === 404 ? '' : `⚪ ${resp.status}`;

    if (tag) {
      console.log(`  ${tag} ${label || path} → ${resp.status} (${ct.split(';')[0]}, ${body.length}b)`);
      if (isJson && body.length < 3000) {
        console.log(`    ${body.substring(0, 2000)}`);
      } else if (resp.status === 302) {
        console.log(`    → ${resp.headers.get('location')}`);
      }
    }
    return { status: resp.status, ct, body };
  } catch (err: any) {
    console.log(`  ❌ ${label || path} → ${err.message}`);
    return { status: -1, ct: 'error', body: '' };
  }
}

async function investigate(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;

  // ========================================
  // 1. Probe /dimas/api/ endpoints
  // ========================================
  console.log('='.repeat(60));
  console.log('1. DIMAS API EXPLORATION');
  console.log('='.repeat(60));

  const dimasUrls = [
    '/dimas/',
    '/dimas/api/',
    '/dimas/api/frontend/',
    '/dimas/api/v1/',
    '/dimas/api/v2/',
    '/dimas/api/frontend/stores/',
    '/dimas/api/frontend/sales/',
    '/dimas/api/frontend/dashboard/',
    '/dimas/api/frontend/reports/',
    '/dimas/api/frontend/kpis/',
    '/dimas/api/frontend/today/',
    '/dimas/api/frontend/live/',
    '/dimas/api/frontend/revenue/',
    '/dimas/api/stores/',
    '/dimas/api/sales/',
    '/dimas/api/reports/',
    '/dimas/api/dashboard/',
    '/dimas/api/kpis/',
    '/dimas/api/schema/',
    '/dimas/api/docs/',
    '/dimas/api/swagger/',
    '/dimas/api/openapi/',
    '/dimas/api/frontend/config/',
    '/dimas/api/frontend/user/',
    '/dimas/api/frontend/settings/',
    '/dimas/api/frontend/data/',
    '/dimas/api/frontend/metrics/',
    '/dimas/api/frontend/charts/',
    '/dimas/api/frontend/widgets/',
  ];

  for (const url of dimasUrls) {
    await tryGet(session, url);
  }

  // ========================================
  // 2. Deep-dive into storesace.js for API routes
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('2. STORESACE.JS API ROUTE EXTRACTION');
  console.log('='.repeat(60));

  // The React bundle is 3.9MB - let's search for API patterns
  const jsResp = await fetch(`${ZSBMS_BASE_URL}/prod/static/frontend/storesace.1424303c.js`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const js = await jsResp.text();
  console.log(`  Bundle size: ${(js.length / 1024 / 1024).toFixed(1)}MB`);

  // Find ALL /dimas/api/ calls
  const dimasApiCalls = [...js.matchAll(/["'](\/dimas\/api\/[^"']+)["']/g)].map(m => m[1]);
  const uniqueDimasApis = [...new Set(dimasApiCalls)].sort();
  console.log(`\n  /dimas/api/ endpoints found (${uniqueDimasApis.length}):`);
  uniqueDimasApis.forEach(u => console.log(`    ${u}`));

  // Find ALL absolute URL patterns
  const allApis = [...js.matchAll(/["'](\/[a-z][a-z0-9_/-]+(?:api|data|json|handler|export|live|stats)[^"']*?)["']/gi)].map(m => m[1]);
  const uniqueApis = [...new Set(allApis)].filter(u => !u.endsWith('.js') && !u.endsWith('.css')).sort();
  if (uniqueApis.length > uniqueDimasApis.length) {
    console.log(`\n  Other API-like URLs (${uniqueApis.length}):`);
    uniqueApis.filter(u => !u.startsWith('/dimas/api/')).forEach(u => console.log(`    ${u}`));
  }

  // Look for fetch/axios calls with relative URLs
  const fetchCalls = [...js.matchAll(/(?:fetch|axios|get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi)].map(m => m[1]);
  const uniqueFetches = [...new Set(fetchCalls)].filter(u => u.startsWith('/') && !u.endsWith('.js')).sort();
  if (uniqueFetches.length > 0) {
    console.log(`\n  Fetch/axios calls:`);
    uniqueFetches.forEach(u => console.log(`    ${u}`));
  }

  // Look for route definitions (React Router)
  const routes = [...js.matchAll(/path\s*:\s*["'`](\/[^"'`]+)["'`]/g)].map(m => m[1]);
  const uniqueRoutes = [...new Set(routes)].sort();
  if (uniqueRoutes.length > 0) {
    console.log(`\n  Frontend routes:`);
    uniqueRoutes.forEach(r => console.log(`    ${r}`));
  }

  // ========================================
  // 3. Try the discovered dimas/api endpoints
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('3. TESTING DISCOVERED DIMAS API ENDPOINTS');
  console.log('='.repeat(60));

  for (const url of uniqueDimasApis.slice(0, 30)) {
    await tryGet(session, url);
  }

  // ========================================
  // 4. Probe interesting new reports via XLSX
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('4. INTERESTING REPORTS (XLSX)');
  console.log('='.repeat(60));

  const today = new Date().toISOString().split('T')[0];

  // Reports that might have today's data or useful extra data
  const interestingReports = [
    { id: 28, name: 'Receita Diária Global' },
    { id: 69, name: 'Resumo Diário' },
    { id: 42, name: 'Métodos Pagamento' },
    { id: 20, name: 'Totais Apurados' },
    { id: 7, name: 'Vendas' },
    { id: 56, name: 'Simplificado' },
    { id: 62, name: 'Análise Orçamental' },
  ];

  for (const report of interestingReports) {
    console.log(`\n  --- Report ${report.id}: ${report.name} ---`);
    const form = new URLSearchParams({
      csrfmiddlewaretoken: session.csrfToken,
      date_range: `${today}   -   ${today}`,
      group_by_dates: '1',
      group_by_stores: '1',
      store_type: '',
      export_type: 'xls',
      extra_info: '',
    });
    form.append('stores', '35');
    form.append('stores', '2');

    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${report.id}/print/`, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${ZSBMS_BASE_URL}/reports/${report.id}/`,
          'User-Agent': 'LupitaDashboard/1.0',
          'X-CSRFToken': session.csrfToken,
        },
        body: form.toString(),
      });
      const ct = resp.headers.get('content-type') || 'unknown';

      if (ct.includes('spreadsheet') || ct.includes('excel')) {
        const buf = await resp.arrayBuffer();
        const XLSX = await import('xlsx');
        const wb = XLSX.read(Buffer.from(buf));
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const nonEmpty = data.filter(row => row.some((c: any) => c !== null && c !== ''));
        console.log(`    ✅ XLSX: ${buf.byteLength}b, ${nonEmpty.length} non-empty rows`);
        nonEmpty.slice(0, 8).forEach((row, i) => console.log(`    [${i}] ${JSON.stringify(row)}`));
      } else if (ct.includes('json')) {
        const text = await resp.text();
        console.log(`    JSON: ${text.substring(0, 500)}`);
      } else {
        console.log(`    ${resp.status} (${ct})`);
      }
    } catch (err: any) {
      console.log(`    Error: ${err.message}`);
    }
  }

  // ========================================
  // 5. Try the grid/handler for Report 69 (Resumo Diário)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('5. GRID HANDLER for alternative reports');
  console.log('='.repeat(60));

  for (const reportId of [28, 69, 7, 20, 56]) {
    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${reportId}/grid/handler/`, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': session.csrfToken,
          'Referer': `${ZSBMS_BASE_URL}/reports/${reportId}/`,
          'Accept': 'application/json',
          'User-Agent': 'LupitaDashboard/1.0',
        },
        body: JSON.stringify({
          start_date: today, end_date: today,
          stores: '35,2', store_type: null,
          group_by_stores: 1, group_by_dates: 1,
          report: reportId,
        }),
      });
      const ct = resp.headers.get('content-type') || 'unknown';
      const text = await resp.text();
      if (ct.includes('json')) {
        const json = JSON.parse(text);
        const hasData = json.rows?.some((r: any) => {
          const vals = Object.values(r).filter(v => typeof v === 'number' && v > 0);
          return vals.length > 0;
        });
        console.log(`  Report ${reportId} handler → ${json.rows?.length} rows, has data: ${hasData}`);
        if (hasData && json.rows.length > 0) {
          console.log(`    Keys: ${Object.keys(json.rows[0]).join(', ')}`);
          console.log(`    First: ${JSON.stringify(json.rows[0]).substring(0, 500)}`);
        }
      } else {
        console.log(`  Report ${reportId} handler → ${resp.status} (${ct})`);
      }
    } catch (err: any) {
      console.log(`  Report ${reportId} handler → Error: ${err.message}`);
    }
  }
}

async function main() {
  const settings = getSyncSettings();
  if (!settings?.zsbms_username || !settings?.zsbms_password_encrypted) {
    console.error('No ZSBMS credentials');
    process.exit(1);
  }
  const password = decrypt(settings.zsbms_password_encrypted);
  const session = await login(settings.zsbms_username, password);
  await investigate(session);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
