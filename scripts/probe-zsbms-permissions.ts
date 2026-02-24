/**
 * ZSBMS Permissions Investigation
 * The grid/handler/ returns all zeros - is this a permissions issue?
 * Let's compare: XLSX export vs JSON handler vs grid HTML
 * Also check user profile/permissions info
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
  console.log('[Probe] ✓ Login OK');
  return { sessionId, csrfToken: responseCookies['csrftoken'] || csrfToken };
}

async function investigate(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  const knownDate = '2026-02-18';

  // ========================================
  // 1. Check XLSX export (this worked before)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('1. XLSX Export test (should still work)');
  console.log('='.repeat(60));

  const printForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: `${knownDate}   -   ${knownDate}`,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    export_type: 'xls',
    extra_info: '',
  });
  printForm.append('stores', '35');
  printForm.append('stores', '2');

  const printResp = await fetch(`${ZSBMS_BASE_URL}/reports/48/print/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
      'User-Agent': 'LupitaDashboard/1.0',
      'X-CSRFToken': session.csrfToken,
    },
    body: printForm.toString(),
  });
  const ct = printResp.headers.get('content-type') || 'unknown';
  console.log(`  XLSX export → ${printResp.status} (${ct})`);

  if (ct.includes('spreadsheet') || ct.includes('excel')) {
    const buf = await printResp.arrayBuffer();
    console.log(`  📊 Got XLSX! Size: ${buf.byteLength} bytes`);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(Buffer.from(buf));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    console.log(`  Rows: ${data.length}`);
    data.slice(0, 5).forEach((row, i) => console.log(`    [${i}] ${JSON.stringify(row)}`));
  } else {
    const text = await printResp.text();
    console.log(`  ❌ Not XLSX. Body: ${text.substring(0, 500)}`);
  }

  // ========================================
  // 2. Check user profile / permissions
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('2. User profile / permissions check');
  console.log('='.repeat(60));

  // Try common Django admin/profile URLs
  const profileUrls = [
    '/user/profile/',
    '/user/settings/',
    '/user/',
    '/accounts/profile/',
    '/admin/',
    '/api/user/',
    '/api/me/',
    '/api/profile/',
    '/permissions/',
    '/user/permissions/',
    '/stores/',
    '/stores/list/',
  ];

  for (const url of profileUrls) {
    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}${url}`, {
        headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
        redirect: 'manual',
      });
      const rct = resp.headers.get('content-type') || 'unknown';
      const status = resp.status;
      const location = resp.headers.get('location') || '';
      if (status === 200) {
        const text = await resp.text();
        const isHtml = rct.includes('html');
        const hasData = text.length > 100;
        const tag = rct.includes('json') ? '🟢 JSON' : hasData ? '🟡 200' : '⚪';
        console.log(`  ${tag} ${url} → ${status} (${rct}, ${text.length}b)`);
        // Look for user info
        if (text.includes('username') || text.includes('user_name') || text.includes('permission') || text.includes('role')) {
          const snippet = text.substring(0, 500).replace(/\s+/g, ' ');
          console.log(`    Contains user/perm info: ${snippet.substring(0, 200)}`);
        }
        // For HTML, look for interesting content
        if (isHtml && text.includes('store') && text.length < 50000) {
          const storeMatches = text.match(/store[^"'\s]{0,30}["'][^"']*["']/gi);
          if (storeMatches) {
            console.log(`    Store references: ${storeMatches.slice(0, 5).join(', ')}`);
          }
        }
      } else if (status === 302 || status === 301) {
        console.log(`  ↩️  ${url} → ${status} redirect to ${location}`);
      } else {
        console.log(`  ⚪ ${url} → ${status}`);
      }
    } catch (err: any) {
      console.log(`  ❌ ${url} → Error: ${err.message}`);
    }
  }

  // ========================================
  // 3. Check home page for user context
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('3. Home page user context');
  console.log('='.repeat(60));

  const homeResp = await fetch(`${ZSBMS_BASE_URL}/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const homeHtml = await homeResp.text();

  // Extract username from the navbar/header
  const userMatch = homeHtml.match(/username|user_name|logged.in.as|welcome.*?([a-zA-Z0-9_.]+)/i);
  if (userMatch) console.log(`  User info: ${userMatch[0]}`);

  // Look for store access info
  const storeAccessMatch = homeHtml.match(/store[s]?\s*[:=]\s*\[([^\]]+)\]/i);
  if (storeAccessMatch) console.log(`  Store access: ${storeAccessMatch[0]}`);

  // Look for permissions/role
  const permMatch = homeHtml.match(/(permission|role|group|access)[^<]{0,200}/gi);
  if (permMatch) {
    permMatch.slice(0, 3).forEach(m => console.log(`  Permission: ${m.trim()}`));
  }

  // Look for "Relatórios" section in sidebar
  const reportSection = homeHtml.match(/relat[oó]rio[s]?[^<]*(<[^>]+>[^<]*){0,20}/gi);
  if (reportSection) {
    console.log(`  Report section found (${reportSection.length} matches)`);
  }

  // ========================================
  // 4. Grid page HTML (check if it shows data or empty)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('4. Grid page HTML - check for embedded data');
  console.log('='.repeat(60));

  const gridForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: `${knownDate}   -   ${knownDate}`,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  gridForm.append('stores', '35');
  gridForm.append('stores', '2');

  const gridResp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': session.csrfToken,
      'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: gridForm.toString(),
  });
  const gridHtml = await gridResp.text();
  console.log(`  Grid HTML size: ${gridHtml.length} bytes`);

  // Check for rowData or embedded data
  const rowDataMatch = gridHtml.match(/rowData\s*:\s*(\[[^\]]{0,2000}\])/);
  if (rowDataMatch) {
    console.log(`  📊 Embedded rowData: ${rowDataMatch[1].substring(0, 500)}`);
  }

  // Check for l_grid_data
  const gridDataMatch = gridHtml.match(/l_grid_data\s*=\s*\{/);
  if (gridDataMatch) {
    // Extract just the postData and context parts
    const postDataMatch = gridHtml.match(/"postData"\s*:\s*(\{[^}]+\})/);
    const contextMatch = gridHtml.match(/"context"\s*:\s*(\{[^}]+\})/);
    const urlMatch = gridHtml.match(/"url"\s*:\s*"([^"]+)"/);
    console.log(`  l_grid_data found!`);
    if (urlMatch) console.log(`    url: ${urlMatch[1]}`);
    if (postDataMatch) console.log(`    postData: ${postDataMatch[1]}`);
    if (contextMatch) console.log(`    context: ${contextMatch[1]}`);

    // Also look for columnDefs field names
    const colNames = [...gridHtml.matchAll(/"field"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
    if (colNames.length > 0) {
      console.log(`    Column fields: ${colNames.join(', ')}`);
    }

    // Check for rowModelType
    const rowModelMatch = gridHtml.match(/"rowModelType"\s*:\s*"([^"]+)"/);
    if (rowModelMatch) console.log(`    rowModelType: ${rowModelMatch[1]}`);
  }

  // ========================================
  // 5. Check if there's a store-specific permission
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('5. Try with store_type parameter');
  console.log('='.repeat(60));

  for (const storeType of ['', 'restaurant', 'all', 'delivery', 'loja']) {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/handler/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        start_date: knownDate, end_date: knownDate,
        stores: '35,2', store_type: storeType || null,
        group_by_stores: 1, group_by_dates: 1, report: 48,
      }),
    });
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      const hasData = json.rows?.some((r: any) => r.sales_total_doc > 0);
      console.log(`  store_type="${storeType || 'null'}" → ${json.rows?.length} rows, has data: ${hasData}`);
    } catch {
      console.log(`  store_type="${storeType}" → not JSON (${text.length}b)`);
    }
  }

  // ========================================
  // 6. Try including SEDE (store 3)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('6. Try including all stores (2, 3, 35)');
  console.log('='.repeat(60));

  const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/handler/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': session.csrfToken,
      'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
      'User-Agent': 'LupitaDashboard/1.0',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      start_date: knownDate, end_date: knownDate,
      stores: '2,3,35', store_type: null,
      group_by_stores: 1, group_by_dates: 1, report: 48,
    }),
  });
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    const totalDoc = json.rows?.reduce((sum: number, r: any) => sum + (r.sales_total_doc || 0), 0);
    console.log(`  All stores → ${json.rows?.length} rows, total sales: ${totalDoc}`);
    if (json.rows?.length > 0) {
      json.rows.forEach((row: any, i: number) => {
        console.log(`    [${i}] ${JSON.stringify(row).substring(0, 300)}`);
      });
    }
  } catch {
    console.log(`  Not JSON (${text.length}b)`);
  }

  // ========================================
  // 7. Try report list endpoint
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('7. Reports list / navigation');
  console.log('='.repeat(60));

  const reportsResp = await fetch(`${ZSBMS_BASE_URL}/reports/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const reportsHtml = await reportsResp.text();
  console.log(`  /reports/ → ${reportsResp.status} (${reportsHtml.length}b)`);

  // Extract report links
  const reportLinks = [...reportsHtml.matchAll(/\/reports\/(\d+)\//g)].map(m => m[1]);
  const uniqueReports = [...new Set(reportLinks)].sort((a, b) => Number(a) - Number(b));
  console.log(`  Available reports: ${uniqueReports.join(', ')}`);

  // Check for permission indicators
  const accessDenied = reportsHtml.includes('denied') || reportsHtml.includes('forbidden') ||
                       reportsHtml.includes('permission') || reportsHtml.includes('acesso');
  console.log(`  Access denied indicators: ${accessDenied ? 'YES' : 'no'}`);
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
