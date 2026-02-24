/**
 * ZSBMS XLSX Deep Analysis
 * The XLSX export works while grid/handler returns zeros (permissions).
 * Let's fully analyze all XLSX reports including TODAY to see what data we can get.
 * Also explore reports we haven't tried yet.
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

async function downloadXLSX(
  session: { sessionId: string; csrfToken: string },
  reportId: number,
  dateRange: string,
  params: Record<string, string> = {},
  label: string
): Promise<any[][] | null> {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  const form = new URLSearchParams({
    csrfmiddlewaretoken: session.csrfToken,
    date_range: dateRange,
    group_by_dates: '1',
    group_by_stores: '1',
    store_type: '',
    export_type: 'xls',
    extra_info: '',
    ...params,
  });
  form.append('stores', '35');
  form.append('stores', '2');

  try {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${reportId}/print/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${ZSBMS_BASE_URL}/reports/${reportId}/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'X-CSRFToken': session.csrfToken,
      },
      body: form.toString(),
    });

    const ct = resp.headers.get('content-type') || 'unknown';
    if (!ct.includes('spreadsheet') && !ct.includes('excel')) {
      console.log(`  ❌ ${label} → ${resp.status} (${ct}) - not XLSX`);
      return null;
    }

    const buf = await resp.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(Buffer.from(buf));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    // Count non-empty rows
    const dataRows = data.filter(row => row.some((c: any) => c !== null && c !== ''));
    console.log(`  ✅ ${label} → ${buf.byteLength}b, ${data.length} total rows, ${dataRows.length} non-empty`);

    return data;
  } catch (err: any) {
    console.log(`  ❌ ${label} → Error: ${err.message}`);
    return null;
  }
}

async function investigate(session: { sessionId: string; csrfToken: string }) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const knownDate = '2026-02-18';

  // ========================================
  // 1. Compare: Known date vs yesterday vs today (all 5 reports)
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('1. Report 48 (Vendas): Known vs Yesterday vs Today');
  console.log('='.repeat(60));

  for (const date of [knownDate, yesterday, today]) {
    const data = await downloadXLSX(session, 48, `${date}   -   ${date}`, {}, `Report 48 - ${date}`);
    if (data) {
      // Show data rows (skip headers/empty)
      const contentRows = data.filter(row => {
        const nonNull = row.filter((c: any) => c !== null);
        return nonNull.length > 2; // more than just margins
      });
      contentRows.slice(0, 8).forEach((row, i) => console.log(`    [${i}] ${JSON.stringify(row)}`));
    }
  }

  // ========================================
  // 2. Zone report for today
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('2. Report 46 (Zonas): Today');
  console.log('='.repeat(60));

  const zoneData = await downloadXLSX(session, 46, `${today}   -   ${today}`, {}, `Zonas - ${today}`);
  if (zoneData) {
    zoneData.filter(row => row.some((c: any) => c !== null)).forEach((row, i) =>
      console.log(`    [${i}] ${JSON.stringify(row)}`)
    );
  }

  // ========================================
  // 3. Hourly report for today
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('3. Report 70 (Horario): Today');
  console.log('='.repeat(60));

  const hourlyData = await downloadXLSX(session, 70, `${today}   -   ${today}`, {}, `Horario - ${today}`);
  if (hourlyData) {
    hourlyData.filter(row => row.some((c: any) => c !== null)).forEach((row, i) =>
      console.log(`    [${i}] ${JSON.stringify(row)}`)
    );
  }

  // ========================================
  // 4. Artigos report for today
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('4. Report 49 (Artigos): Today');
  console.log('='.repeat(60));

  const artData = await downloadXLSX(session, 49, `${today}   -   ${today}`, {}, `Artigos - ${today}`);
  if (artData) {
    artData.filter(row => row.some((c: any) => c !== null)).slice(0, 15).forEach((row, i) =>
      console.log(`    [${i}] ${JSON.stringify(row)}`)
    );
  }

  // ========================================
  // 5. ABC report for today
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('5. Report 9 (ABC): Today');
  console.log('='.repeat(60));

  const abcData = await downloadXLSX(session, 9, `${today}   -   ${today}`, {}, `ABC - ${today}`);
  if (abcData) {
    abcData.filter(row => row.some((c: any) => c !== null)).slice(0, 15).forEach((row, i) =>
      console.log(`    [${i}] ${JSON.stringify(row)}`)
    );
  }

  // ========================================
  // 6. Explore other potentially useful reports
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('6. Exploring other reports');
  console.log('='.repeat(60));

  // First, get report names from the reports page
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  const reportsPage = await fetch(`${ZSBMS_BASE_URL}/`, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const reportsHtml = await reportsPage.text();

  // Extract report links with their names from the sidebar
  const reportMatches = [...reportsHtml.matchAll(/<a[^>]*href="\/reports\/(\d+)\/"[^>]*>([^<]+)</g)];
  const reports = reportMatches.map(m => ({ id: Number(m[1]), name: m[2].trim() }));
  const uniqueReports = reports.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

  console.log(`  Found ${uniqueReports.length} named reports:`);
  uniqueReports.forEach(r => console.log(`    Report ${r.id}: ${r.name}`));

  // Try a few interesting-looking reports we haven't used
  const interestingIds = uniqueReports
    .filter(r => !([48, 46, 49, 9, 70].includes(r.id)))
    .filter(r =>
      r.name.toLowerCase().includes('venda') ||
      r.name.toLowerCase().includes('fatur') ||
      r.name.toLowerCase().includes('cliente') ||
      r.name.toLowerCase().includes('resumo') ||
      r.name.toLowerCase().includes('diário') ||
      r.name.toLowerCase().includes('diario') ||
      r.name.toLowerCase().includes('tempo') ||
      r.name.toLowerCase().includes('real')
    )
    .slice(0, 5);

  console.log(`\n  Trying ${interestingIds.length} potentially useful reports:`);
  for (const report of interestingIds) {
    const data = await downloadXLSX(
      session, report.id,
      `${today}   -   ${today}`,
      {},
      `Report ${report.id} (${report.name}) - today`
    );
    if (data) {
      const nonEmpty = data.filter(row => row.some((c: any) => c !== null));
      nonEmpty.slice(0, 5).forEach((row, i) =>
        console.log(`    [${i}] ${JSON.stringify(row)}`)
      );
    }
  }

  // ========================================
  // 7. Summary: Compare data availability
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Date tested: ${today} (today)`);
  console.log(`  Grid handler (JSON): ALL ZEROS (permissions issue)`);
  console.log(`  XLSX export: See results above`);
  console.log(`  Key finding: XLSX for today shows if real-time data is available`);
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
