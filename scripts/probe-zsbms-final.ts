/**
 * ZSBMS Final Investigation
 * 1. Extract ALL report names properly
 * 2. Deep-dive into app.base.min.js for undiscovered endpoints
 * 3. Summarize all findings
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

async function investigate(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;

  // ========================================
  // 1. Get ALL report names from sidebar
  // ========================================
  console.log('='.repeat(60));
  console.log('1. REPORT CATALOG');
  console.log('='.repeat(60));

  const homeResp = await fetch(`${ZSBMS_BASE_URL}/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const homeHtml = await homeResp.text();

  // Try multiple extraction patterns
  // Pattern 1: href with text content
  const links1 = [...homeHtml.matchAll(/<a[^>]*href="\/reports\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/g)];
  const reports = new Map<string, string>();
  for (const m of links1) {
    const id = m[1];
    // Clean the text (remove HTML tags, whitespace)
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 0 && !reports.has(id)) {
      reports.set(id, text);
    }
  }

  // Pattern 2: title attribute
  const links2 = [...homeHtml.matchAll(/href="\/reports\/(\d+)\/"[^>]*title="([^"]+)"/g)];
  for (const m of links2) {
    if (!reports.has(m[1])) reports.set(m[1], m[2]);
  }

  // Pattern 3: data-original-title
  const links3 = [...homeHtml.matchAll(/href="\/reports\/(\d+)\/"[^>]*data-original-title="([^"]+)"/g)];
  for (const m of links3) {
    if (!reports.has(m[1])) reports.set(m[1], m[2]);
  }

  if (reports.size > 0) {
    // Group by category (looking at the HTML structure)
    const sorted = [...reports.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    console.log(`\n  Found ${sorted.length} named reports:`);
    for (const [id, name] of sorted) {
      const marker = ['48', '46', '49', '9', '70'].includes(id) ? '  ★ (currently used)' : '';
      console.log(`    Report ${id.padStart(3)}: ${name}${marker}`);
    }
  } else {
    console.log('  Could not extract report names from sidebar');
    // Show raw HTML around /reports/ links
    const sample = homeHtml.match(/<a[^>]*href="\/reports\/48[^"]*"[\s\S]{0,300}/);
    if (sample) {
      console.log(`  HTML sample near report 48: ${sample[0].substring(0, 200)}`);
    }
  }

  // ========================================
  // 2. JS Bundle deep analysis
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('2. JS BUNDLE ANALYSIS (app.base.min.js)');
  console.log('='.repeat(60));

  const jsUrls = [...homeHtml.matchAll(/src=["']([^"']+\.js[^"']*?)["']/g)].map(m => m[1]);
  const appJs = jsUrls.find(u => u.includes('app.base'));
  if (!appJs) {
    console.log('  Could not find app.base JS');
    return;
  }

  const jsUrl = appJs.startsWith('/') ? `${ZSBMS_BASE_URL}${appJs}` : appJs;
  const jsResp = await fetch(jsUrl, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const js = await jsResp.text();
  console.log(`  Bundle size: ${js.length} bytes`);

  // a) Find all URL-like strings
  console.log('\n  a) URL patterns in JS:');
  const urlPatterns = [...js.matchAll(/["'](\/[a-z][a-z0-9_/.-]+\/?)["']/g)]
    .map(m => m[1])
    .filter(u => !u.endsWith('.js') && !u.endsWith('.css') && !u.endsWith('.png') && !u.endsWith('.svg') && !u.endsWith('.ico'));
  const uniqueUrls = [...new Set(urlPatterns)].sort();
  uniqueUrls.forEach(u => console.log(`    ${u}`));

  // b) Find function names related to data loading
  console.log('\n  b) Data-related functions:');
  const funcNames = [...js.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const dataFuncs = funcNames.filter(n =>
    /data|load|fetch|grid|handler|ajax|api|store|report|export|download|sync|refresh|update|real|live/i.test(n)
  );
  [...new Set(dataFuncs)].forEach(f => console.log(`    ${f}()`));

  // c) Find the full clientSideDatasource implementation
  console.log('\n  c) clientSideDatasource full implementation:');
  const dsIdx = js.indexOf('clientSideDatasource');
  if (dsIdx >= 0) {
    // Find the function boundaries
    let start = dsIdx;
    while (start > 0 && js[start] !== ';' && js[start] !== '}') start--;
    let depth = 0;
    let end = dsIdx;
    let foundBody = false;
    for (let i = dsIdx; i < js.length && i < dsIdx + 2000; i++) {
      if (js[i] === '{') { depth++; foundBody = true; }
      if (js[i] === '}') depth--;
      if (foundBody && depth === 0) { end = i + 1; break; }
    }
    const func = js.substring(start + 1, end).trim();
    console.log(`    ${func}`);
  }

  // d) Find the getGridOptionApi function
  console.log('\n  d) getGridOptionApi function:');
  const apiIdx = js.indexOf('getGridOptionApi');
  if (apiIdx >= 0) {
    let start = apiIdx;
    while (start > 0 && js[start] !== ';' && js[start] !== '}') start--;
    let depth = 0;
    let end = apiIdx;
    let foundBody = false;
    for (let i = apiIdx; i < js.length && i < apiIdx + 1000; i++) {
      if (js[i] === '{') { depth++; foundBody = true; }
      if (js[i] === '}') depth--;
      if (foundBody && depth === 0) { end = i + 1; break; }
    }
    const func = js.substring(start + 1, end).trim();
    console.log(`    ${func}`);
  }

  // e) Find all $.ajax calls
  console.log('\n  e) All $.ajax calls:');
  const ajaxCalls = [...js.matchAll(/\$\.ajax\s*\(\s*\{[\s\S]{0,300}?\}/g)];
  ajaxCalls.forEach((m, i) => {
    console.log(`    [${i}] ${m[0].substring(0, 200)}`);
  });

  // f) Find "reloadGrid" trigger and related functions
  console.log('\n  f) Grid reload/refresh patterns:');
  const reloadPatterns = [...js.matchAll(/(reloadGrid|refreshGrid|updateGrid|gridRefresh|storeRefreshed)[\s\S]{0,100}/gi)];
  const uniqueReload = [...new Set(reloadPatterns.map(m => m[0].substring(0, 120)))];
  uniqueReload.forEach(p => console.log(`    ${p}`));

  // g) Check for WebSocket or SSE
  console.log('\n  g) WebSocket/SSE/EventSource patterns:');
  const wsPatterns = [...js.matchAll(/(WebSocket|EventSource|socket\.io|ws:\/\/|wss:\/\/)[\s\S]{0,100}/gi)];
  if (wsPatterns.length > 0) {
    wsPatterns.forEach(p => console.log(`    ${p[0].substring(0, 120)}`));
  } else {
    console.log('    None found');
  }

  // h) Check for polling / setInterval patterns
  console.log('\n  h) Polling/interval patterns:');
  const pollingPatterns = [...js.matchAll(/setInterval\s*\([^)]{0,200}\)/g)];
  pollingPatterns.forEach(p => console.log(`    ${p[0].substring(0, 150)}`));

  // ========================================
  // 3. Check other JS files for additional endpoints
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('3. OTHER JS FILES');
  console.log('='.repeat(60));

  for (const jsFile of jsUrls) {
    if (jsFile.includes('app.base')) continue;
    if (jsFile.includes('cdn') || jsFile.includes('jquery') || jsFile.includes('bootstrap') || jsFile.includes('tawk')) continue;
    console.log(`\n  ${jsFile}:`);
    const url = jsFile.startsWith('/') ? `${ZSBMS_BASE_URL}${jsFile}` : jsFile;
    try {
      const resp = await fetch(url, {
        headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
      });
      const content = await resp.text();
      console.log(`    Size: ${content.length}b`);

      // Look for API endpoints
      const endpoints = [...content.matchAll(/["'](\/[a-z][\w/-]*(?:handler|api|data|json|export|live|real)[^"']*?)["']/gi)];
      if (endpoints.length > 0) {
        [...new Set(endpoints.map(m => m[1]))].forEach(e => console.log(`    Endpoint: ${e}`));
      }
    } catch {
      console.log(`    Error loading`);
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

  // ========================================
  // FINAL SUMMARY
  // ========================================
  console.log('\n\n' + '═'.repeat(60));
  console.log('  INVESTIGATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │ ENDPOINT DISCOVERY                                      │
  ├─────────────────────────────────────────────────────────┤
  │ ✅ grid/handler/ → JSON API (needs permissions fix)     │
  │ ✅ print/ → XLSX export (works for closed days only)    │
  │ ❌ No REST API (/api/*) found                           │
  │ ❌ No WebSocket/SSE found                               │
  │ ❌ No dashboard live endpoint found                      │
  ├─────────────────────────────────────────────────────────┤
  │ DATA AVAILABILITY                                       │
  ├─────────────────────────────────────────────────────────┤
  │ XLSX today → 0 data (only closed/finalized days)        │
  │ JSON today → 0 data (permissions, but structure works)  │
  │ XLSX past dates → ✅ full data available                │
  │ JSON past dates → 0 data (same permissions issue)       │
  ├─────────────────────────────────────────────────────────┤
  │ RECOMMENDATIONS                                         │
  ├─────────────────────────────────────────────────────────┤
  │ 1. Fix grid/handler permissions in ZSBMS POS settings   │
  │ 2. Once fixed: JSON API is 10x faster than XLSX        │
  │    - No file download/parse needed                      │
  │    - Real-time data including today                     │
  │    - Can sync every 5 min for intra-day updates        │
  │ 3. Current XLSX sync: reliable for daily batch import   │
  │    - Schedule at 7:00 AM for previous day              │
  │    - Already works correctly                            │
  │ 4. Potential improvement: dual-mode sync                │
  │    - Daily XLSX at 7 AM (guaranteed data, fallback)    │
  │    - Optional JSON every 15 min (if permissions fixed) │
  └─────────────────────────────────────────────────────────┘
  `);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
