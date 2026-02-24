/**
 * ZSBMS Server-Side Row Model Investigation
 * The ag-grid uses SSRM - find the actual data loading endpoint.
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

  // 1. Get the grid HTML and extract the FULL script
  console.log('=== 1. Extracting full grid script for report 48 ===');
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

  const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': session.csrfToken,
      'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: vendasForm.toString(),
  });
  const html = await resp.text();

  // Extract the script content
  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const script = scriptMatch[1];
    console.log(`Script length: ${script.length} chars`);

    // Look for rowData, datasource, getRows, URL patterns
    const patterns = [
      { name: 'rowData', regex: /rowData\s*[:=]/g },
      { name: 'datasource', regex: /(?:server(?:Side)?)?[Dd]ata[Ss]ource/g },
      { name: 'getRows', regex: /getRows/g },
      { name: 'fetch/ajax URL', regex: /(?:fetch|ajax|get|post|url)\s*\(\s*["']([^"']+)["']/gi },
      { name: 'URL patterns', regex: /["'](\/[^"'\s]+)["']/g },
      { name: 'rowModelType', regex: /rowModelType/g },
      { name: 'createGrid', regex: /createGrid|new\s+Grid/g },
      { name: 'pinnedBottomRowData', regex: /pinnedBottomRowData/g },
      { name: 'pinnedTopRowData', regex: /pinnedTopRowData/g },
    ];

    for (const { name, regex } of patterns) {
      const matches = [...script.matchAll(regex)];
      if (matches.length > 0) {
        console.log(`  🟢 ${name}: ${matches.length} matches`);
        matches.forEach(m => {
          const start = Math.max(0, m.index! - 50);
          const end = Math.min(script.length, m.index! + m[0].length + 200);
          console.log(`    Context: ...${script.substring(start, end)}...`);
        });
      }
    }

    // Show the FULL script for analysis (limited to key parts)
    console.log('\n  --- Key sections of the script ---');

    // Find the rowData assignment (this is where data comes from)
    const rowDataIdx = script.indexOf('rowData');
    if (rowDataIdx >= 0) {
      console.log(`\n  rowData context (pos ${rowDataIdx}):`);
      console.log(script.substring(Math.max(0, rowDataIdx - 200), rowDataIdx + 2000));
    }

    // Find function calls and their URLs
    const funcCalls = script.match(/\w+\s*\([^)]*["'][^"']+["'][^)]*\)/g) || [];
    const uniqueFuncs = [...new Set(funcCalls)];
    if (uniqueFuncs.length) {
      console.log('\n  Function calls with string args:');
      uniqueFuncs.forEach(f => console.log(`    ${f.substring(0, 200)}`));
    }

    // Show the last 3000 chars (often contains data loading logic)
    console.log('\n  --- Last part of script ---');
    console.log(script.substring(Math.max(0, script.length - 3000)));
  }

  // 2. Also check what JS files the main report page loads (might contain SSRM logic)
  console.log('\n=== 2. Checking main report page JS files ===');
  const mainPage = await fetch(`${ZSBMS_BASE_URL}/reports/48/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const mainHtml = await mainPage.text();
  const jsFiles = mainHtml.match(/src=["']([^"']+\.js[^"']*)["']/g) || [];
  console.log(`JS files loaded:`);
  jsFiles.forEach(f => {
    const url = f.replace(/src=["']|["']/g, '');
    if (!url.includes('gtag') && !url.includes('datadog') && !url.includes('hound'))
      console.log(`  ${url}`);
  });

  // 3. Fetch the custom JS file that likely contains the SSRM data loading
  console.log('\n=== 3. Looking for custom app JS with SSRM logic ===');
  const customJs = jsFiles
    .map(f => f.replace(/src=["']|["']/g, ''))
    .filter(f => f.includes('reports') || f.includes('grid') || f.includes('custom') || f.includes('app') || f.includes('base'));

  for (const jsUrl of customJs.slice(0, 3)) {
    const fullUrl = jsUrl.startsWith('/') ? `${ZSBMS_BASE_URL}${jsUrl}` : jsUrl;
    console.log(`\n  Fetching: ${fullUrl}`);
    try {
      const jsResp = await fetch(fullUrl, {
        headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
      });
      const jsText = await jsResp.text();
      console.log(`  Size: ${jsText.length} bytes`);

      // Search for data loading patterns
      const dataPatterns = [
        /getRows|fetch|ajax|datasource|rowData|loadData/gi,
        /\/reports\/.*?\/(?:data|rows|grid)/gi,
      ];
      for (const p of dataPatterns) {
        const matches = [...jsText.matchAll(p)];
        if (matches.length) {
          console.log(`  Found ${matches.length} matches for ${p.source}:`);
          matches.slice(0, 5).forEach(m => {
            const start = Math.max(0, m.index! - 100);
            const end = Math.min(jsText.length, m.index! + 300);
            console.log(`    ...${jsText.substring(start, end).replace(/\n/g, ' ')}...`);
          });
        }
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
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
