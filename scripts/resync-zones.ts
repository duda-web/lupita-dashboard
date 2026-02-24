/**
 * One-off script to re-download and re-import 2026 zone data with the fixed parser.
 * Run: npx tsx scripts/resync-zones.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { decrypt } from '../server/services/encryption';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const db = new Database(path.resolve(__dirname, '../lupita.db'));
const settings: any = db.prepare('SELECT * FROM sync_settings LIMIT 1').get();
db.close();

if (!settings) { console.log('No sync settings found'); process.exit(1); }

const password = decrypt(settings.zsbms_password_encrypted);

const ZSBMS_BASE_URL = 'https://515449741.zsbmspro.com';
const LOGIN_URL = `${ZSBMS_BASE_URL}/user/login/`;

function extractCookie(headers: Headers, name: string): string | undefined {
  const cookies = headers.getSetCookie?.() || [];
  for (const h of cookies) {
    const match = h.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}

async function main() {
  // Login step 1
  const page = await fetch(LOGIN_URL, {
    method: 'GET', redirect: 'manual',
    headers: { 'User-Agent': 'LupitaDashboard/1.0' },
  });
  const csrfToken = extractCookie(page.headers, 'csrftoken');
  if (!csrfToken) throw new Error('No CSRF token');

  // Login step 2
  const loginData = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    username: settings.zsbms_username,
    password,
    next: '/',
  });
  const loginResp = await fetch(LOGIN_URL, {
    method: 'POST', redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `csrftoken=${csrfToken}`,
      'Referer': LOGIN_URL,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: loginData.toString(),
  });
  const sessionId = extractCookie(loginResp.headers, 'sessionid');
  if (!sessionId) throw new Error('Login failed');
  const newCsrf = extractCookie(loginResp.headers, 'csrftoken') || csrfToken;
  console.log('✓ Logged in to ZSBMS');

  // Download full 2026 zone report
  const formData = new URLSearchParams();
  formData.append('csrfmiddlewaretoken', newCsrf);
  formData.append('date_range', '2026-01-01   -   2026-02-24');
  formData.append('group_by_dates', '1');
  formData.append('store_type', '');
  formData.append('stores', '35');  // Alvalade
  formData.append('stores', '2');   // Cais do Sodré
  formData.append('group_by_stores', '1');
  formData.append('export_type', 'xls');
  formData.append('extra_info', '');

  console.log('⬇ Downloading zone report (Jan 1 – Feb 24 2026)...');
  const resp = await fetch(`${ZSBMS_BASE_URL}/reports/46/print/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `sessionid=${sessionId}; csrftoken=${newCsrf}`,
      'Referer': `${ZSBMS_BASE_URL}/reports/46/`,
      'User-Agent': 'LupitaDashboard/1.0',
    },
    body: formData.toString(),
  });

  if (!resp.ok) throw new Error(`Export failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const outPath = path.resolve(__dirname, '../data/resync_zones_2026.xlsx');
  fs.writeFileSync(outPath, buf);
  console.log(`✓ Downloaded (${(buf.length / 1024).toFixed(1)} KB) → ${outPath}`);

  // Import with fixed parser
  const { importZoneFile } = await import('../server/services/importService');
  const result = importZoneFile(outPath);

  console.log('\n=== IMPORT RESULT ===');
  console.log(`  Inserted: ${result.recordsInserted}`);
  console.log(`  Updated:  ${result.recordsUpdated}`);
  console.log(`  Errors:   ${result.errors.length === 0 ? 'none' : result.errors.join(', ')}`);
  console.log(`  Period:   ${result.dateFrom} → ${result.dateTo}`);

  // Cleanup
  fs.unlinkSync(outPath);
  console.log('\n✓ Done! Temp file cleaned up.');
}

main().catch(e => { console.error('✗ Error:', e.message); process.exit(1); });
