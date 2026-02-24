/**
 * ZSBMS Grid Handler Probe
 * Tests the discovered grid/handler/ endpoint for all reports
 * to get real-time JSON data (including today's partial data).
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

async function probeHandler(session: { sessionId: string; csrfToken: string }) {
  const cookieHeader = `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`;
  const today = new Date().toISOString().split('T')[0]; // 2026-02-24

  // Reports to test
  const reports = [
    { id: 48, name: 'Vendas Completo', postData: { start_date: today, end_date: today, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 48 } },
    { id: 46, name: 'Zonas', postData: { start_date: today, end_date: today, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 46 } },
    { id: 49, name: 'Artigos', postData: { start_date: today, end_date: today, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 49 } },
    { id: 9, name: 'ABC', postData: { start_date: today, end_date: today, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 9 } },
    { id: 70, name: 'Horario', postData: { start_date: today, end_date: today, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 70 } },
  ];

  for (const report of reports) {
    console.log(`\n=== Report ${report.id}: ${report.name} ===`);

    // Try 1: POST JSON to grid/handler/
    const jsonBody = JSON.stringify(report.postData);
    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${report.id}/grid/handler/`, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': session.csrfToken,
          'Referer': `${ZSBMS_BASE_URL}/reports/${report.id}/`,
          'User-Agent': 'LupitaDashboard/1.0',
          'Accept': 'application/json, text/plain, */*',
        },
        body: jsonBody,
      });
      const ct = resp.headers.get('content-type') || 'unknown';
      const text = await resp.text();
      console.log(`  POST (JSON body) → ${resp.status} (${ct}, ${text.length}b)`);

      if (ct.includes('json') || (resp.status === 200 && text.startsWith('{'))) {
        try {
          const json = JSON.parse(text);
          console.log(`  ✅ JSON parsed! Keys: ${Object.keys(json).join(', ')}`);
          if (json.rows) {
            console.log(`  📊 ROWS: ${json.rows.length}`);
            if (json.rows.length > 0) {
              console.log(`  First row keys: ${Object.keys(json.rows[0]).join(', ')}`);
              console.log(`  First row: ${JSON.stringify(json.rows[0]).substring(0, 500)}`);
              if (json.rows.length > 1) {
                console.log(`  Second row: ${JSON.stringify(json.rows[1]).substring(0, 500)}`);
              }
            }
          }
          if (json.lastRow !== undefined) console.log(`  lastRow: ${json.lastRow}`);
          // Show full preview if small
          if (text.length < 5000) {
            console.log(`  Full response: ${text}`);
          } else {
            console.log(`  Preview: ${text.substring(0, 1500)}`);
          }
        } catch (e: any) {
          console.log(`  JSON parse error: ${e.message}`);
          console.log(`  Raw: ${text.substring(0, 1000)}`);
        }
      } else {
        console.log(`  Body preview: ${text.substring(0, 500)}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }

    // Try 2: POST form-encoded to grid/handler/
    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(report.postData)) {
      if (v !== null) formData.append(k, String(v));
    }
    formData.append('csrfmiddlewaretoken', session.csrfToken);

    try {
      const resp = await fetch(`${ZSBMS_BASE_URL}/reports/${report.id}/grid/handler/`, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': session.csrfToken,
          'Referer': `${ZSBMS_BASE_URL}/reports/${report.id}/`,
          'User-Agent': 'LupitaDashboard/1.0',
          'Accept': 'application/json, text/plain, */*',
        },
        body: formData.toString(),
      });
      const ct = resp.headers.get('content-type') || 'unknown';
      const text = await resp.text();
      console.log(`  POST (form-encoded) → ${resp.status} (${ct}, ${text.length}b)`);

      if (ct.includes('json') || (resp.status === 200 && text.startsWith('{'))) {
        try {
          const json = JSON.parse(text);
          console.log(`  ✅ JSON parsed! Keys: ${Object.keys(json).join(', ')}`);
          if (json.rows) {
            console.log(`  📊 ROWS: ${json.rows.length}`);
            if (json.rows.length > 0) {
              console.log(`  First row keys: ${Object.keys(json.rows[0]).join(', ')}`);
              console.log(`  First row: ${JSON.stringify(json.rows[0]).substring(0, 500)}`);
            }
          }
          if (text.length < 5000) {
            console.log(`  Full response: ${text}`);
          } else {
            console.log(`  Preview: ${text.substring(0, 1500)}`);
          }
        } catch (e: any) {
          console.log(`  JSON parse error: ${e.message}`);
          console.log(`  Raw: ${text.substring(0, 1000)}`);
        }
      } else {
        console.log(`  Body preview: ${text.substring(0, 500)}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Also try yesterday to confirm we get data for closed days
  console.log('\n\n=== CONTROL TEST: Yesterday (closed day) ===');
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const controlData = { start_date: yesterday, end_date: yesterday, stores: '35,2', store_type: null, group_by_stores: 1, group_by_dates: 1, report: 48 };

  try {
    const resp = await fetch(`${ZSBMS_BASE_URL}/reports/48/grid/handler/`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': session.csrfToken,
        'Referer': `${ZSBMS_BASE_URL}/reports/48/`,
        'User-Agent': 'LupitaDashboard/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify(controlData),
    });
    const ct = resp.headers.get('content-type') || 'unknown';
    const text = await resp.text();
    console.log(`  POST yesterday (${yesterday}) → ${resp.status} (${ct}, ${text.length}b)`);

    if (ct.includes('json') || text.startsWith('{')) {
      const json = JSON.parse(text);
      console.log(`  Keys: ${Object.keys(json).join(', ')}`);
      if (json.rows) {
        console.log(`  📊 ROWS: ${json.rows.length}`);
        if (json.rows.length > 0) {
          console.log(`  First row: ${JSON.stringify(json.rows[0]).substring(0, 500)}`);
        }
      }
    } else {
      console.log(`  Body: ${text.substring(0, 500)}`);
    }
  } catch (err: any) {
    console.log(`  Error: ${err.message}`);
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
  await probeHandler(session);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
