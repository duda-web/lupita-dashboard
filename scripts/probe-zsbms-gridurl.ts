/**
 * Extract the data URL from ZSBMS grid options.
 * The ag-grid uses clientSideDatasource which calls getGridOptionApi(t, "url")
 * to load data as JSON. We need to find that URL.
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
  const yearRange = `${now.getFullYear()}-01-01   -   ${dateTo}`;

  // For each report, get the grid HTML and extract the full JSON config
  const reports = [
    { id: 48, name: 'Vendas Completo', params: { group_by_stores: '1' } },
    { id: 46, name: 'Zonas', params: { group_by_stores: '1' } },
  ];

  for (const report of reports) {
    console.log(`\n=== Report ${report.id}: ${report.name} ===`);

    const form = new URLSearchParams({
      csrfmiddlewaretoken: session.csrfToken,
      date_range: todayOnly,
      group_by_dates: '1',
      store_type: '',
      extra_info: '',
      ...report.params,
    });
    form.append('stores', '35');
    form.append('stores', '2');

    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${report.id}/grid/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/${report.id}/`,
        'User-Agent': 'LupitaDashboard/1.0',
      },
      body: form.toString(),
    });
    const html = await resp.text();

    // Extract the l_grid_data JSON
    const match = html.match(/l_grid_data\s*=\s*(\{[\s\S]*?\});\s*(?:let|var|const|$)/);
    if (match) {
      try {
        // The JSON might have trailing JS, try to find the right boundary
        let jsonStr = match[1];
        // Find the end by counting braces
        let depth = 0;
        let end = 0;
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') depth++;
          if (jsonStr[i] === '}') depth--;
          if (depth === 0) { end = i + 1; break; }
        }
        jsonStr = jsonStr.substring(0, end);
        const gridData = JSON.parse(jsonStr);

        // Extract interesting properties
        console.log('  Grid option keys:', Object.keys(gridData).join(', '));

        // Look for url, postData, datasource, context
        for (const key of ['url', 'postData', 'datasource', 'dataSource', 'serverSideDatasource', 'context', 'rowModelType', 'rowData']) {
          if (gridData[key] !== undefined) {
            const val = typeof gridData[key] === 'object' ? JSON.stringify(gridData[key]).substring(0, 500) : gridData[key];
            console.log(`  🟢 ${key}: ${val}`);
          }
        }

        // Check context for url
        if (gridData.context) {
          console.log('  context keys:', Object.keys(gridData.context).join(', '));
          for (const key of ['url', 'postData', 'printUrl', 'export_url']) {
            if (gridData.context[key] !== undefined) {
              console.log(`  🟢 context.${key}: ${JSON.stringify(gridData.context[key]).substring(0, 500)}`);
            }
          }
        }

        // Search all string values for URLs
        const findUrls = (obj: any, path: string = '') => {
          if (typeof obj === 'string' && obj.startsWith('/')) {
            console.log(`  📍 ${path}: "${obj}"`);
          } else if (typeof obj === 'object' && obj !== null) {
            for (const [k, v] of Object.entries(obj)) {
              if (['columnDefs', 'sideBar', 'statusBar', 'selectionColumnDef', 'defaultColDef'].includes(k)) continue;
              findUrls(v, path ? `${path}.${k}` : k);
            }
          }
        };
        findUrls(gridData);

      } catch (err: any) {
        console.log(`  Parse error: ${err.message}`);
        // Show the raw match for debugging
        console.log(`  Raw grid data (first 2000 chars): ${match[1].substring(0, 2000)}`);
      }
    } else {
      console.log('  Could not extract l_grid_data');
      // Try alternative patterns
      const altMatch = html.match(/["']url["']\s*:\s*["']([^"']+)["']/);
      if (altMatch) {
        console.log(`  🟢 Found url pattern: ${altMatch[1]}`);
      }
    }
  }

  // Now try to call the grid data endpoint directly
  console.log('\n=== Trying direct grid data call ===');

  // The grid HTML at /reports/48/grid/ likely also has the URL pointing to itself
  // Let's try calling it with JSON data type parameters
  const dataForm = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: todayOnly,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    extra_info: '',
    startRow: '0',
    endRow: '100',
    sortModel: '[]',
    rowGroupCols: '[]',
  });
  dataForm.append('stores', '35');
  dataForm.append('stores', '2');

  // Try /reports/48/grid/ with different content types
  for (const accept of ['application/json', '*/*']) {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': accept,
      },
      body: dataForm.toString(),
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const text = await resp.text();
    console.log(`  POST /reports/48/grid/ (Accept: ${accept}) → ${resp.status} (${ct}, ${text.length}b)`);
    if (ct.includes('json')) {
      try {
        const json = JSON.parse(text);
        console.log(`    Keys: ${Object.keys(json).join(', ')}`);
        if (json.rows) {
          console.log(`    ✅ ROWS FOUND! Count: ${json.rows.length}`);
          console.log(`    First row: ${JSON.stringify(json.rows[0])}`);
          if (json.rows.length > 1) console.log(`    Second row: ${JSON.stringify(json.rows[1])}`);
        }
        console.log(`    Preview: ${text.substring(0, 1000)}`);
      } catch {
        console.log(`    Raw: ${text.substring(0, 1000)}`);
      }
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
