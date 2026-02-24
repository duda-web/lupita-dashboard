/**
 * Find the initializeGrid function in dimas-reports.min.js
 * to discover where ag-grid data is loaded from.
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

  // Fetch the custom report JS files
  const jsFiles = [
    '/prod/static/dimas/js/dimas-reports.min.5fcc738d3506.js',
    '/prod/static/base/js/app.base.min.ae77288ddd74.js',
  ];

  for (const jsPath of jsFiles) {
    console.log(`\n=== Fetching ${jsPath} ===`);
    const resp = await fetch(`${ZSBMS_BASE_URL}${jsPath}`, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
    });
    const jsText = await resp.text();
    console.log(`Size: ${jsText.length} bytes`);

    // Search for initializeGrid function
    const initGridIdx = jsText.indexOf('initializeGrid');
    if (initGridIdx >= 0) {
      console.log(`\n  🟢 initializeGrid found at position ${initGridIdx}!`);
      // Show context around it (4000 chars around it)
      const start = Math.max(0, initGridIdx - 200);
      const end = Math.min(jsText.length, initGridIdx + 4000);
      console.log(jsText.substring(start, end));
    }

    // Also search for rowData loading patterns
    const patterns = [
      { name: 'rowData', search: 'rowData' },
      { name: 'setRowData', search: 'setRowData' },
      { name: 'applyTransaction', search: 'applyTransaction' },
      { name: 'updateRowData', search: 'updateRowData' },
      { name: 'grid/data', search: 'grid/data' },
      { name: '/grid/', search: '/grid/' },
      { name: 'getRows', search: 'getRows' },
    ];

    for (const { name, search } of patterns) {
      const indices: number[] = [];
      let idx = jsText.indexOf(search);
      while (idx !== -1 && indices.length < 3) {
        indices.push(idx);
        idx = jsText.indexOf(search, idx + 1);
      }
      if (indices.length) {
        console.log(`\n  🔍 ${name}: ${indices.length}+ occurrences`);
        for (const i of indices) {
          const s = Math.max(0, i - 100);
          const e = Math.min(jsText.length, i + 300);
          console.log(`    Pos ${i}: ...${jsText.substring(s, e).replace(/\n/g, ' ')}...`);
        }
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
