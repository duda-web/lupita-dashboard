/**
 * ZSBMS HTML Analysis - Deep inspection of report page HTML
 * to find ag-grid data sources, embedded data, or AJAX endpoints.
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

async function analyzeReportPage(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;

  // Fetch report page 48 (Vendas Completo)
  console.log('\n=== Fetching /reports/48/ (Vendas Completo) ===');
  const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const html = await resp.text();
  console.log(`Page size: ${html.length} bytes`);

  // 1. Find all URLs/endpoints in the HTML
  console.log('\n--- URLs found in HTML ---');
  const urlMatches = html.match(/["'](\/[^"'\s]{3,}?)["']/g) || [];
  const uniqueUrls = [...new Set(urlMatches.map(m => m.replace(/["']/g, '')))].filter(u =>
    !u.endsWith('.js') && !u.endsWith('.css') && !u.endsWith('.png') && !u.endsWith('.svg') &&
    !u.endsWith('.ico') && !u.endsWith('.jpg') && !u.endsWith('.gif') && !u.endsWith('.woff') &&
    !u.endsWith('.woff2') && !u.endsWith('.ttf') && !u.startsWith('/static/')
  );
  uniqueUrls.forEach(u => console.log(`  ${u}`));

  // 2. Find JavaScript that loads data
  console.log('\n--- JS data patterns ---');
  const jsPatterns = [
    /(?:url|endpoint|api|data_?url|ajax_?url|fetch_?url|load_?url|source_?url|row_?data|grid_?data)\s*[:=]\s*["']([^"']+)["']/gi,
    /\$\.(?:get|post|ajax|getJSON)\s*\(\s*["']([^"']+)["']/gi,
    /fetch\s*\(\s*["']([^"']+)["']/gi,
    /XMLHttpRequest.*?open\s*\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/gi,
    /datasource\s*[:=]\s*["']([^"']+)["']/gi,
    /rowModelType\s*[:=]\s*["']([^"']+)["']/gi,
    /serverSideDataSource|getRows|successCallback/gi,
  ];

  for (const pattern of jsPatterns) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length > 0) {
      console.log(`  Pattern: ${pattern.source}`);
      matches.forEach(m => console.log(`    → ${m[1] || m[0]}`));
    }
  }

  // 3. Find ag-grid configuration
  console.log('\n--- ag-grid config ---');
  const agGridMatch = html.match(/ag-grid|agGrid|gridOptions|columnDefs/gi);
  console.log(`  ag-grid references: ${agGridMatch?.length || 0}`);

  // 4. Find script blocks with data
  console.log('\n--- Script blocks analysis ---');
  const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`  Total script blocks: ${scriptBlocks.length}`);

  for (let i = 0; i < scriptBlocks.length; i++) {
    const block = scriptBlocks[i];
    // Skip external scripts
    if (block.includes(' src=')) continue;

    const content = block.replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 50) {
      console.log(`\n  Script block #${i} (${content.length} chars):`);

      // Look for interesting patterns
      if (content.includes('rowData') || content.includes('row_data')) {
        console.log(`    🟢 Contains rowData!`);
        console.log(`    Preview: ${content.substring(0, 500)}`);
      }
      if (content.includes('url') || content.includes('endpoint') || content.includes('ajax')) {
        // Extract URLs from this script
        const urls = content.match(/["'](\/[^"']+)["']/g);
        if (urls) {
          console.log(`    URLs: ${[...new Set(urls)].join(', ')}`);
        }
      }
      if (content.includes('print') || content.includes('export') || content.includes('report')) {
        console.log(`    Contains report/print/export logic`);
        // Show the part around "print"
        const printIdx = content.indexOf('print');
        if (printIdx >= 0) {
          console.log(`    Context: ...${content.substring(Math.max(0, printIdx - 100), printIdx + 200)}...`);
        }
      }
      if (content.includes('data') && content.length < 5000) {
        // Might have inline data
        console.log(`    Full content preview: ${content.substring(0, 800)}`);
      }
    }
  }

  // 5. Find form elements (might reveal data submission patterns)
  console.log('\n--- Forms ---');
  const forms = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/gi) || [];
  forms.forEach(f => console.log(`  ${f}`));

  // 6. Look for WebSocket patterns
  console.log('\n--- WebSocket/SSE patterns ---');
  const wsPatterns = html.match(/(?:WebSocket|EventSource|ws:|wss:)[^"'\s]*/gi);
  console.log(`  WebSocket/SSE: ${wsPatterns ? wsPatterns.join(', ') : 'none'}`);

  // 7. Fetch the home page to check for dashboard widget data
  console.log('\n=== Checking home page for dashboard data ===');
  const homeResp = await fetch(`${ZSBMS_BASE_URL}/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const homeHtml = await homeResp.text();
  console.log(`Home page size: ${homeHtml.length} bytes`);

  // Look for today's revenue data on the home page
  const today = new Date().toISOString().split('T')[0];
  if (homeHtml.includes(today)) {
    console.log(`  🟡 Contains today's date (${today})`);
  }

  // Check for dashboard widgets with inline data
  const homeScripts = homeHtml.match(/<script[^>]*>(?!.*src=)([\s\S]*?)<\/script>/gi) || [];
  for (let i = 0; i < homeScripts.length; i++) {
    const content = homeScripts[i].replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 100 && (content.includes('chart') || content.includes('data') || content.includes('revenue') || content.includes('vendas') || content.includes('total'))) {
      console.log(`\n  Home script #${i} (${content.length} chars):`);
      console.log(`    Preview: ${content.substring(0, 800)}`);
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
  await analyzeReportPage(session);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
