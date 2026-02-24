/**
 * ZSBMS Grid JSON Endpoint - Deep investigation
 * Report 70 (Hourly) returned JSON! Let's get data from it.
 * Also analyze the HTML grid responses from other reports for embedded data.
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
  const now = new Date();
  const dateTo = now.toISOString().split('T')[0];
  const todayOnly = `${dateTo}   -   ${dateTo}`;

  // Helper for POST requests
  async function postGrid(reportId: number, formParams: URLSearchParams, label: string) {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${reportId}/grid/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/${reportId}/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': 'application/json, text/html, */*',
      },
      body: formParams.toString(),
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const text = await resp.text();
    const isJson = ct.includes('json');
    console.log(`\n  ${isJson ? '🟢' : '🟡'} ${label} → ${resp.status} (${ct}, ${text.length}b)`);
    if (isJson) {
      try {
        const json = JSON.parse(text);
        console.log(`    Keys: ${Object.keys(json).join(', ')}`);
        if (json.rows) console.log(`    Rows count: ${json.rows.length}`);
        if (json.data) console.log(`    Data count: ${json.data.length}`);
        console.log(`    Preview: ${text.substring(0, 2000)}`);
      } catch {
        console.log(`    Raw: ${text.substring(0, 2000)}`);
      }
    } else {
      // Check if the HTML contains row data or table data
      const hasTable = text.includes('<table') || text.includes('<tr');
      const hasRowData = text.includes('rowData') || text.includes('row_data');
      const hasGrid = text.includes('gridOptions') || text.includes('ag-grid');
      const hasJsonData = text.includes('JSON.parse') || text.includes('var data');
      console.log(`    HTML: table=${hasTable}, rowData=${hasRowData}, grid=${hasGrid}, jsonData=${hasJsonData}`);

      // Extract any embedded JSON data
      const jsonMatches = text.match(/(?:rowData|row_data|gridData|data)\s*[:=]\s*(\[[^\]]*\]|\{[^}]*\})/g);
      if (jsonMatches) {
        console.log(`    Embedded data found: ${jsonMatches.length} matches`);
        jsonMatches.forEach(m => console.log(`      ${m.substring(0, 500)}`));
      }

      // Look for table rows with data
      const tdMatches = text.match(/<td[^>]*>([^<]+)<\/td>/g);
      if (tdMatches && tdMatches.length > 0) {
        console.log(`    Table cells: ${tdMatches.length}`);
        console.log(`    First cells: ${tdMatches.slice(0, 20).map(t => t.replace(/<[^>]+>/g, '')).join(' | ')}`);
      }

      // Show a chunk of the HTML to understand structure
      console.log(`    HTML preview: ${text.substring(0, 1500)}`);
    }
    return text;
  }

  // === 1. Report 70 (Hourly) - This returned JSON! ===
  console.log('=== 1. Report 70 (Hourly) grid with proper params ===');
  const hourlyForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores_zones: '3',
    store_type: '',
    options: '2',
    group_data: '',
    extra_info: '',
  });
  hourlyForm.append('stores', '35');
  hourlyForm.append('stores', '2');
  await postGrid(70, hourlyForm, 'Hourly (today)');

  // === 2. Report 48 (Vendas Completo) - Analyze HTML grid ===
  console.log('\n=== 2. Report 48 (Vendas Completo) grid HTML analysis ===');
  const vendasForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  vendasForm.append('stores', '35');
  vendasForm.append('stores', '2');
  const html48 = await postGrid(48, vendasForm, 'Vendas Completo (today)');

  // === 3. Report 46 (Zones) - Analyze HTML grid ===
  console.log('\n=== 3. Report 46 (Zones) grid HTML analysis ===');
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
  await postGrid(46, zonesForm, 'Zones (today)');

  // === 4. Try report 48 grid with different Accept header ===
  console.log('\n=== 4. Report 48 grid with Accept: application/json ===');
  {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': 'application/json',
      },
      body: vendasForm.toString(),
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const text = await resp.text();
    console.log(`  ${ct.includes('json') ? '🟢' : '⚪'} → ${resp.status} (${ct}, ${text.length}b)`);
    if (ct.includes('json')) console.log(`    Preview: ${text.substring(0, 2000)}`);
  }

  // === 5. Try report 56 (Dashboard Vendas?) which we found in the report list ===
  console.log('\n=== 5. Report 56 (might be dashboard) ===');
  const dashForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
  });
  dashForm.append('stores', '35');
  dashForm.append('stores', '2');
  await postGrid(56, dashForm, 'Report 56 (today)');

  // === 6. Check the Vendas Completo grid HTML for ag-Grid rowData ===
  console.log('\n=== 6. Deep HTML analysis of Report 48 grid ===');
  // Search for any script tags in the grid HTML
  const scripts = html48.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`  Script blocks in grid HTML: ${scripts.length}`);
  scripts.forEach((s, i) => {
    const content = s.replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 20) {
      console.log(`  Block #${i} (${content.length} chars): ${content.substring(0, 1000)}`);
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
