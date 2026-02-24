/**
 * ZSBMS Grid Handler Deep Investigation
 * Now that we know grid/handler/ returns JSON, let's understand:
 * 1. What fields the rows contain when data IS available
 * 2. How the postData affects grouping/aggregation
 * 3. Whether stores need to be separate or comma-separated
 * 4. What other postData fields exist (from the grid config)
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

async function callHandler(
  session: { sessionId: string; csrfToken: string },
  reportId: number,
  postData: Record<string, any>,
  label: string
): Promise<any> {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  try {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${reportId}/grid/handler/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/${reportId}/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify(postData),
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const text = await resp.text();

    if (ct.includes('json') || text.startsWith('{')) {
      const json = JSON.parse(text);
      const rowCount = json.rows?.length || 0;
      const tag = rowCount > 0 ? '✅' : '⚪';
      console.log(`  ${tag} ${label} → ${resp.status} | ${rowCount} rows`);
      if (rowCount > 0) {
        console.log(`     Keys: ${Object.keys(json.rows[0]).join(', ')}`);
        // Show first 3 rows
        json.rows.slice(0, 3).forEach((row: any, i: number) => {
          console.log(`     [${i}] ${JSON.stringify(row).substring(0, 600)}`);
        });
        if (rowCount > 3) console.log(`     ... and ${rowCount - 3} more rows`);
      }
      return json;
    } else {
      console.log(`  ❌ ${label} → ${resp.status} (${ct}, ${text.length}b) - not JSON`);
      return null;
    }
  } catch (err: any) {
    console.log(`  ❌ ${label} → Error: ${err.message}`);
    return null;
  }
}

async function deepInvestigation(session: { sessionId: string; csrfToken: string }) {
  // Use a date range where we KNOW data exists in our DB
  // Let's use Feb 17-18 (recent known data)
  const knownDate = '2026-02-18';
  const today = new Date().toISOString().split('T')[0];

  // ========================================
  // TEST 1: Known date vs today comparison
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Known date (Feb 18) vs today for Report 48');
  console.log('='.repeat(60));

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, `Report 48 - ${knownDate}`);

  await callHandler(session, 48, {
    start_date: today, end_date: today,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, `Report 48 - ${today} (today)`);

  // ========================================
  // TEST 2: Date range (full week)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Full week range (Feb 17-23)');
  console.log('='.repeat(60));

  await callHandler(session, 48, {
    start_date: '2026-02-17', end_date: '2026-02-23',
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, 'Report 48 - Feb 17-23 (week)');

  // ========================================
  // TEST 3: Without group_by options
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Vendas without grouping options');
  console.log('='.repeat(60));

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 0, group_by_dates: 0, report: 48,
  }, 'No grouping');

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 0, report: 48,
  }, 'Group by stores only');

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 0, group_by_dates: 1, report: 48,
  }, 'Group by dates only');

  // ========================================
  // TEST 4: Single store
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Single store (Cais do Sodre = 2)');
  console.log('='.repeat(60));

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, 'Store 2 only');

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, 'Store 35 only');

  // ========================================
  // TEST 5: Zonas report (46) for known date
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Zonas (Report 46) for known date');
  console.log('='.repeat(60));

  await callHandler(session, 46, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 46,
  }, `Zonas - ${knownDate}`);

  await callHandler(session, 46, {
    start_date: today, end_date: today,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 46,
  }, `Zonas - ${today} (today)`);

  // ========================================
  // TEST 6: Artigos report (49)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 6: Artigos (Report 49) for known date');
  console.log('='.repeat(60));

  await callHandler(session, 49, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 49,
  }, `Artigos - ${knownDate}`);

  // ========================================
  // TEST 7: Horario (70) - this had different grid config
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 7: Horario (Report 70) for known date');
  console.log('='.repeat(60));

  await callHandler(session, 70, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 70,
  }, `Horario - ${knownDate}`);

  // ========================================
  // TEST 8: Explore the grid config to find ALL postData fields
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 8: Extract full grid config from report pages');
  console.log('='.repeat(60));

  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;

  for (const reportId of [48, 46, 49, 70]) {
    // First we need to POST to get the grid HTML
    const form = new URLSearchParams({
      csrfmiddlewaretoken: session.csrfToken,
      date_range: `${knownDate}   -   ${knownDate}`,
      group_by_dates: '1',
      group_by_stores: '1',
      store_type: '',
      extra_info: '',
    });
    form.append('stores', '35');
    form.append('stores', '2');

    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${reportId}/grid/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/${reportId}/`,
        'User-Agent': 'LupitaDashboard/1.0',
      },
      body: form.toString(),
    });
    const html = await resp.text();

    // Extract postData from the grid config
    const postDataMatch = html.match(/postData\s*:\s*(\{[^}]+\})/);
    if (postDataMatch) {
      console.log(`  Report ${reportId} postData: ${postDataMatch[1]}`);
    }

    // Extract url from grid config
    const urlMatch = html.match(/["\']url["\']\s*:\s*["\'](grid\/handler\/)["\']/) ||
                     html.match(/url\s*:\s*["\'](grid\/handler\/)["\']/) ||
                     html.match(/["\'](grid\/handler\/)["\']/) ||
                     html.match(/url\s*:\s*["\']([^"\']+)["\'].*?handler/);
    if (urlMatch) {
      console.log(`  Report ${reportId} url: ${urlMatch[1]}`);
    }

    // Extract context object
    const contextMatch = html.match(/context\s*:\s*(\{[^}]+\})/);
    if (contextMatch) {
      console.log(`  Report ${reportId} context: ${contextMatch[1]}`);
    }

    // Check for any "extra_info" or additional params
    const extraMatch = html.match(/extra_info[^,}]*/);
    if (extraMatch) {
      console.log(`  Report ${reportId} extra_info: ${extraMatch[0]}`);
    }
  }

  // ========================================
  // TEST 9: ag-grid pagination params (startRow/endRow)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 9: With ag-grid startRow/endRow params');
  console.log('='.repeat(60));

  await callHandler(session, 48, {
    start_date: knownDate, end_date: knownDate,
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
    startRow: 0, endRow: 100,
  }, 'With startRow/endRow');

  // ========================================
  // TEST 10: Full month range to see all data structure
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 10: Full month Feb 2026 with both stores');
  console.log('='.repeat(60));

  const result = await callHandler(session, 48, {
    start_date: '2026-02-01', end_date: '2026-02-23',
    stores: '35,2', store_type: null,
    group_by_stores: 1, group_by_dates: 1, report: 48,
  }, 'Feb 1-23 grouped by store+date');

  if (result?.rows?.length > 0) {
    // Show field analysis
    const firstRow = result.rows[0];
    console.log('\n  📋 Field analysis:');
    for (const [key, value] of Object.entries(firstRow)) {
      const type = typeof value;
      const sample = type === 'string' ? `"${(value as string).substring(0, 50)}"` : value;
      console.log(`     ${key}: ${type} = ${sample}`);
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
  await deepInvestigation(session);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
