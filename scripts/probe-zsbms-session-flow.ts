/**
 * ZSBMS Session Flow Investigation
 * The grid/handler/ might need to be called AFTER establishing a grid context
 * by POSTing to /reports/{id}/grid/ first (Django session state).
 * Also: XLSX export works but returns only closed days, so let's fully analyze it.
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
  // TEST A: Establish grid session, THEN call handler
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST A: Grid session → handler flow');
  console.log('='.repeat(60));

  // Step 1: POST to /reports/48/grid/ (like the browser does)
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

  console.log('  Step 1: POST /reports/48/grid/ (establish context)...');
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
  console.log(`  Grid HTML → ${gridResp.status} (${gridHtml.length}b)`);

  // Check if response set any new cookies
  const newCookies = extractCookies(gridResp);
  if (Object.keys(newCookies).length > 0) {
    console.log(`  New cookies from grid: ${JSON.stringify(newCookies)}`);
  }

  // Extract the postData from the grid config (this is what the JS sends to handler)
  const postDataMatch = gridHtml.match(/"postData"\s*:\s*(\{[^}]+\})/);
  let postData: any = null;
  if (postDataMatch) {
    postData = JSON.parse(postDataMatch[1]);
    console.log(`  Extracted postData: ${JSON.stringify(postData)}`);
  }

  // Step 2: Now call grid/handler/ with the EXACT postData from the grid config
  if (postData) {
    console.log('\n  Step 2: POST grid/handler/ with extracted postData...');
    const handlerResp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/handler/`, {
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
      body: JSON.stringify(postData),
    });
    const handlerText = await handlerResp.text();
    console.log(`  Handler → ${handlerResp.status} (${handlerText.length}b)`);
    try {
      const json = JSON.parse(handlerText);
      console.log(`  Rows: ${json.rows?.length}`);
      if (json.rows?.length > 0) {
        const hasData = json.rows.some((r: any) => r.sales_total_doc > 0);
        console.log(`  Has real data: ${hasData}`);
        json.rows.slice(0, 3).forEach((r: any, i: number) => {
          console.log(`    [${i}] ${JSON.stringify(r).substring(0, 400)}`);
        });
      }
    } catch (e: any) {
      console.log(`  Parse error: ${e.message}`);
    }
  }

  // ========================================
  // TEST B: Try the handler with different Referer
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST B: Different Referer headers');
  console.log('='.repeat(60));

  for (const referer of [
    `${ZSBMS_BASE_URL}/reports/48/`,
    `${ZSBMS_BASE_URL}/reports/48/grid/`,
    `${ZSBMS_BASE_URL}/`,
    '', // no referer
  ]) {
    const headers: Record<string, string> = {
      'Cookie': cookieHeader,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': session.csrfToken,
      'Accept': 'application/json',
      'User-Agent': 'LupitaDashboard/1.0',
    };
    if (referer) headers['Referer'] = referer;

    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/handler/`, {
      method: 'POST', headers,
      body: JSON.stringify({
        start_date: knownDate, end_date: knownDate,
        stores: '35,2', items: '', store_type: null,
        group_by_stores: 1, group_by_dates: 1, report: 48,
      }),
    });
    const text = await resp.text();
    const json = JSON.parse(text);
    const hasData = json.rows?.some((r: any) => r.sales_total_doc > 0);
    console.log(`  Referer="${referer || 'none'}" → ${json.rows?.length} rows, data: ${hasData}`);
  }

  // ========================================
  // TEST C: Try using the RELATIVE url "grid/handler/" vs absolute
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST C: Different URL patterns');
  console.log('='.repeat(60));

  const urlVariants = [
    `${ZSBMS_BASE_URL}/reports/48/grid/handler/`,
    `${ZSBMS_BASE_URL}/reports/48/grid/handler`,  // no trailing slash
    `${ZSBMS_BASE_URL}/reports/grid/handler/`,
    `${ZSBMS_BASE_URL}/grid/handler/`,
  ];

  for (const url of urlVariants) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': session.csrfToken,
          'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
          'Accept': 'application/json',
          'User-Agent': 'LupitaDashboard/1.0',
        },
        body: JSON.stringify({
          start_date: knownDate, end_date: knownDate,
          stores: '35,2', store_type: null,
          group_by_stores: 1, group_by_dates: 1, report: 48,
        }),
      });
      const ct = resp.headers.get('content-type') || 'unknown';
      console.log(`  ${url.replace(ZSBMS_BASE_URL, '')} → ${resp.status} (${ct})`);
    } catch (e: any) {
      console.log(`  ${url.replace(ZSBMS_BASE_URL, '')} → Error: ${e.message}`);
    }
  }

  // ========================================
  // TEST D: Analyze XLSX export fully for Feb 18
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST D: Full XLSX analysis (Feb 18)');
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
  const buf = await printResp.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(Buffer.from(buf));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log(`  Sheet: ${wb.SheetNames[0]}, Rows: ${data.length}`);
  data.forEach((row, i) => {
    const nonNull = row.filter((c: any) => c !== null);
    if (nonNull.length > 0) {
      console.log(`    [${i}] ${JSON.stringify(row)}`);
    }
  });

  // ========================================
  // TEST E: XLSX for today (confirm 0 vs has data)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST E: XLSX export for TODAY');
  console.log('='.repeat(60));

  const today = new Date().toISOString().split('T')[0];
  const todayForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: `${today}   -   ${today}`,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    export_type: 'xls',
    extra_info: '',
  });
  todayForm.append('stores', '35');
  todayForm.append('stores', '2');

  const todayResp = await fetch(`${ZSBMS_BASE_URL}/reports/48/print/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
      'User-Agent': 'LupitaDashboard/1.0',
      'X-CSRFToken': session.csrfToken,
    },
    body: todayForm.toString(),
  });
  const todayBuf = await todayResp.arrayBuffer();
  const todayWb = XLSX.read(Buffer.from(todayBuf));
  const todayWs = todayWb.Sheets[todayWb.SheetNames[0]];
  const todayData: any[][] = XLSX.utils.sheet_to_json(todayWs, { header: 1, raw: true, defval: null });
  console.log(`  Today XLSX rows: ${todayData.length}`);
  todayData.forEach((row, i) => {
    const nonNull = row.filter((c: any) => c !== null);
    if (nonNull.length > 0) {
      console.log(`    [${i}] ${JSON.stringify(row)}`);
    }
  });

  // ========================================
  // TEST F: Check Zone report (46) XLSX for today
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST F: Zonas XLSX for today');
  console.log('='.repeat(60));

  const zoneForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: `${today}   -   ${today}`,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    export_type: 'xls',
    extra_info: '',
  });
  zoneForm.append('stores', '35');
  zoneForm.append('stores', '2');

  const zoneResp = await fetch(`${ZSBMS_BASE_URL}/reports/46/print/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${ZSBMS_BASE_URL}/reports/46/`,
      'User-Agent': 'LupitaDashboard/1.0',
      'X-CSRFToken': session.csrfToken,
    },
    body: zoneForm.toString(),
  });
  const zoneBuf = await zoneResp.arrayBuffer();
  const zoneWb = XLSX.read(Buffer.from(zoneBuf));
  const zoneWs = zoneWb.Sheets[zoneWb.SheetNames[0]];
  const zoneData: any[][] = XLSX.utils.sheet_to_json(zoneWs, { header: 1, raw: true, defval: null });
  console.log(`  Zonas today XLSX rows: ${zoneData.length}`);
  zoneData.forEach((row, i) => {
    const nonNull = row.filter((c: any) => c !== null);
    if (nonNull.length > 0) {
      console.log(`    [${i}] ${JSON.stringify(row)}`);
    }
  });
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
