/**
 * ZSBMS Reports Catalog & Alternative Endpoints
 * Discover all available reports and their data capabilities.
 * Also look for real-time / dashboard endpoints.
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

  // ========================================
  // 1. Get the full sidebar / navbar to find ALL report names
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('1. Extract report catalog from sidebar');
  console.log('='.repeat(60));

  const homeResp = await fetch(`${ZSBMS_BASE_URL}/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const homeHtml = await homeResp.text();

  // Extract ALL links with /reports/
  const allReportLinks = [...homeHtml.matchAll(/href=["']\/reports\/(\d+)\/["'][^>]*>([^<]*)/g)];
  if (allReportLinks.length > 0) {
    console.log(`  Found ${allReportLinks.length} report links:`);
    const seen = new Set<string>();
    allReportLinks.forEach(m => {
      const id = m[1];
      const name = m[2].trim();
      if (!seen.has(id) && name.length > 0) {
        seen.add(id);
        console.log(`    Report ${id}: ${name}`);
      }
    });
  }

  // Also try broader pattern
  const navSection = homeHtml.match(/<nav[\s\S]*?<\/nav>/gi);
  if (navSection) {
    const navLinks = [...navSection.join('').matchAll(/href="([^"]+)"[^>]*>\s*([^<]+)/g)];
    const reportLinks = navLinks.filter(m => m[1].includes('/reports/'));
    if (reportLinks.length > allReportLinks.length) {
      console.log(`\n  Broader search - ${reportLinks.length} nav report links:`);
      reportLinks.forEach(m => console.log(`    ${m[1]} → ${m[2].trim()}`));
    }
  }

  // Try the sidebar/menu specifically
  const sidebarMatch = homeHtml.match(/sidebar[\s\S]{0,50000}?(?=<\/aside|<\/nav|<\/div>\s*<main)/i);
  if (sidebarMatch) {
    const sideLinks = [...sidebarMatch[0].matchAll(/\/reports\/(\d+)\/[\s\S]{0,200}?(?:>|\btitle=["'])([^<"']+)/g)];
    if (sideLinks.length > 0) {
      console.log(`\n  Sidebar reports:`);
      sideLinks.forEach(m => console.log(`    Report ${m[1]}: ${m[2].trim()}`));
    }
  }

  // ========================================
  // 2. Look for "Dashboard" or "Painel" widgets
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('2. Look for dashboard / real-time endpoints');
  console.log('='.repeat(60));

  // Check home page for dashboard widgets
  const scripts = [...homeHtml.matchAll(/<script(?!.*?src=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i][1].trim();
    if (content.length < 50) continue;

    // Look for data URLs, chart configs, dashboard data
    const hasInteresting = ['chart', 'dash', 'ajax', 'fetch(', 'api/', 'data-', 'revenue', 'venda', 'fatura'].some(k =>
      content.toLowerCase().includes(k)
    );

    if (hasInteresting) {
      console.log(`\n  Script block #${i} (${content.length} chars):`);
      // Extract URLs
      const urls = [...content.matchAll(/["'](\/[^"']+)["']/g)].map(m => m[1]);
      if (urls.length > 0) {
        const unique = [...new Set(urls)].filter(u => !u.endsWith('.js') && !u.endsWith('.css'));
        console.log(`    URLs: ${unique.join(', ')}`);
      }
      // Show relevant portions
      const shortened = content.substring(0, 500);
      console.log(`    Preview: ${shortened}`);
    }
  }

  // ========================================
  // 3. Try some specific "real-time" related URLs
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('3. Probing real-time / live endpoints');
  console.log('='.repeat(60));

  const liveUrls = [
    '/dashboard/',
    '/dashboard/live/',
    '/dashboard/today/',
    '/live/',
    '/realtime/',
    '/monitor/',
    '/today/',
    '/kpi/',
    '/reports/live/',
    '/reports/today/',
    '/reports/dashboard/',
    '/vendas/hoje/',
    '/vendas/live/',
    '/stats/',
    '/stats/today/',
    '/api/stats/',
    '/api/kpi/',
    '/api/live/',
    '/api/today/',
    '/api/dashboard/',
    '/websocket/',
    '/ws/',
    '/events/',
    '/stream/',
  ];

  for (const url of liveUrls) {
    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}${url}`, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'LupitaDashboard/1.0',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/html, */*',
        },
        redirect: 'manual',
      });
      const ct = resp.headers.get('content-type') || 'unknown';
      if (resp.status === 200) {
        const text = await resp.text();
        const isJson = ct.includes('json');
        const tag = isJson ? '🟢 JSON!' : `🟡 200 (${ct.split(';')[0]})`;
        console.log(`  ${tag} ${url} → ${text.length}b`);
        if (isJson || text.length < 2000) {
          console.log(`    ${text.substring(0, 500)}`);
        }
      } else if (resp.status === 302 || resp.status === 301) {
        const location = resp.headers.get('location') || '';
        console.log(`  ↩️  ${url} → ${location}`);
      } else if (resp.status !== 404) {
        console.log(`  ⚪ ${url} → ${resp.status}`);
      }
    } catch (err: any) {
      // skip errors
    }
  }

  // ========================================
  // 4. Check the JavaScript bundle for API endpoints
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('4. Check JS bundles for undiscovered endpoints');
  console.log('='.repeat(60));

  // Find all JS file URLs
  const jsUrls = [...homeHtml.matchAll(/src=["']([^"']+\.js[^"']*?)["']/g)].map(m => m[1]);
  console.log(`  JS files found: ${jsUrls.length}`);

  // Check the main app bundle for API calls
  const appJs = jsUrls.find(u => u.includes('app.base') || u.includes('app.min') || u.includes('bundle'));
  if (appJs) {
    const jsUrl = appJs.startsWith('/') ? `${ZSBMS_BASE_URL}${appJs}` : appJs;
    console.log(`  Fetching ${appJs}...`);
    const jsResp = await fetch(jsUrl, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
    });
    const jsContent = await jsResp.text();
    console.log(`  Size: ${jsContent.length} bytes`);

    // Find all URL patterns in the JS
    const apiPatterns = [...jsContent.matchAll(/["'](\/(?:api|data|ajax|live|real|dash|monitor|kpi|stats|stream|ws|event|report)[^"']*?)["']/gi)];
    if (apiPatterns.length > 0) {
      const unique = [...new Set(apiPatterns.map(m => m[1]))];
      console.log(`\n  API-like URLs in JS bundle:`);
      unique.forEach(u => console.log(`    ${u}`));
    }

    // Find fetch/ajax calls
    const fetchCalls = [...jsContent.matchAll(/(?:fetch|ajax|get|post)\s*\(\s*["']([^"']+)["']/gi)];
    if (fetchCalls.length > 0) {
      const unique = [...new Set(fetchCalls.map(m => m[1]))].filter(u => !u.endsWith('.js') && !u.endsWith('.css'));
      console.log(`\n  Fetch/AJAX calls in JS:`);
      unique.forEach(u => console.log(`    ${u}`));
    }

    // Look for handler URL construction
    const handlerPatterns = [...jsContent.matchAll(/handler[^"'\s]{0,100}/gi)];
    if (handlerPatterns.length > 0) {
      const unique = [...new Set(handlerPatterns.map(m => m[0]))].slice(0, 10);
      console.log(`\n  Handler patterns:`);
      unique.forEach(u => console.log(`    ${u}`));
    }

    // Look for "clientSideDatasource" function
    const dsMatch = jsContent.match(/clientSideDatasource[^{]*\{[\s\S]{0,500}/);
    if (dsMatch) {
      console.log(`\n  clientSideDatasource function:`);
      console.log(`    ${dsMatch[0].substring(0, 300)}`);
    }

    // Look for "grid/handler" usage
    const gridHandlerMatch = jsContent.match(/grid.{0,5}handler[^)]{0,200}/gi);
    if (gridHandlerMatch) {
      console.log(`\n  grid/handler usage:`);
      gridHandlerMatch.forEach(m => console.log(`    ${m.substring(0, 150)}`));
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
