/**
 * ZSBMS Grid Endpoint Investigation
 * Probes /reports/{id}/grid/ which appears to be the ag-grid data source.
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

async function probeGridEndpoints(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-01-01`;
  const dateTo = now.toISOString().split('T')[0];
  const dateRange = `${dateFrom}   -   ${dateTo}`;
  const todayOnly = `${dateTo}   -   ${dateTo}`;

  async function tryRequest(url: string, method: string = 'GET', body?: string, label?: string): Promise<string> {
    const headers: Record<string, string> = {
      'Cookie': cookieHeader,
      'User-Agent': 'LupitaDashboard/1.0',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/plain, */*',
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['X-CSRFToken'] = session.csrfToken;
      headers['Referer'] = `${ZSBMS_BASE_URL}/reports/48/`;
    }

    try {
      const resp = await fetch(url, { method, headers, body, redirect: 'manual' });
      const ct = resp.headers.get('content-type') || 'unknown';
      const text = await resp.text();
      const isJson = ct.includes('json');
      const tag = isJson ? '🟢 JSON' : resp.status === 200 ? '🟡 200' : `⚪ ${resp.status}`;
      console.log(`  ${tag} ${method} ${label || url} → ${resp.status} (${ct}, ${text.length}b)`);
      if (isJson || (resp.status === 200 && text.length < 50000 && !ct.includes('html'))) {
        console.log(`    Preview: ${text.substring(0, 1000)}`);
      }
      return text;
    } catch (err: any) {
      console.log(`  ❌ ${method} ${label || url} → Error: ${err.message}`);
      return '';
    }
  }

  // 1. Try GET /reports/48/grid/
  console.log('\n=== 1. GET grid endpoints ===');
  for (const id of [48, 46, 49, 9, 70]) {
    await tryRequest(`${ZSBMS_BASE_URL}/reports/${id}/grid/`, 'GET', undefined, `/reports/${id}/grid/`);
  }

  // 2. Try POST /reports/48/grid/ with report parameters
  console.log('\n=== 2. POST grid with report params ===');
  const formData = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: dateRange,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  formData.append('stores', '35');
  formData.append('stores', '2');

  await tryRequest(
    `${ZSBMS_BASE_URL}/reports/48/grid/`,
    'POST',
    formData.toString(),
    '/reports/48/grid/ (full year)',
  );

  // 3. Try POST with only today's date range
  console.log('\n=== 3. POST grid with today only ===');
  const todayForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  todayForm.append('stores', '35');
  todayForm.append('stores', '2');

  await tryRequest(
    `${ZSBMS_BASE_URL}/reports/48/grid/`,
    'POST',
    todayForm.toString(),
    '/reports/48/grid/ (today only)',
  );

  // 4. Try the grid endpoint for zones report
  console.log('\n=== 4. POST grid for zones (today) ===');
  const zonesForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  zonesForm.append('stores', '35');
  zonesForm.append('stores', '2');

  await tryRequest(
    `${ZSBMS_BASE_URL}/reports/46/grid/`,
    'POST',
    zonesForm.toString(),
    '/reports/46/grid/ (zones, today)',
  );

  // 5. Try without group_by_dates (in case the grid endpoint works differently)
  console.log('\n=== 5. POST grid without group_by_dates ===');
  const simpleForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  simpleForm.append('stores', '35');
  simpleForm.append('stores', '2');

  await tryRequest(
    `${ZSBMS_BASE_URL}/reports/48/grid/`,
    'POST',
    simpleForm.toString(),
    '/reports/48/grid/ (no group_by_dates)',
  );

  // 6. Try with ag-grid server-side row model params
  console.log('\n=== 6. POST grid with ag-grid params ===');
  const agGridForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
    startRow: '0',
    endRow: '100',
  });
  agGridForm.append('stores', '35');
  agGridForm.append('stores', '2');

  await tryRequest(
    `${ZSBMS_BASE_URL}/reports/48/grid/`,
    'POST',
    agGridForm.toString(),
    '/reports/48/grid/ (ag-grid pagination)',
  );

  // 7. Try /reports/48/print/ for today only (might include partial data)
  console.log('\n=== 7. Print endpoint today only (XLS) ===');
  const printForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
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
  console.log(`  Print today-only → ${printResp.status} (${ct})`);
  if (ct.includes('spreadsheet') || ct.includes('excel')) {
    const buf = await printResp.arrayBuffer();
    console.log(`  📊 Got XLSX! Size: ${buf.byteLength} bytes`);
    // Save for inspection
    const fs = await import('fs');
    const path = '/tmp/zsbms-today-test.xlsx';
    fs.writeFileSync(path, Buffer.from(buf));
    console.log(`  Saved to ${path}`);

    // Quick parse
    const XLSX = await import('xlsx');
    const wb = XLSX.read(Buffer.from(buf));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    console.log(`  Rows: ${data.length}`);
    data.slice(0, 15).forEach((row, i) => console.log(`    [${i}] ${JSON.stringify(row)}`));
  } else {
    const text = await printResp.text();
    console.log(`  Body preview: ${text.substring(0, 500)}`);
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
  await probeGridEndpoints(session);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
