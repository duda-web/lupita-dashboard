/**
 * ZSBMS Sync Service
 *
 * Orchestrates the full sync pipeline:
 * 1. Read credentials from sync_settings (decrypt password)
 * 2. Create sync_log entry with status=running
 * 3. Download 5 XLSX reports from ZSBMS PRO
 * 4. Import each file using existing parsers
 * 5. Update sync_log with final result
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSyncSettings, createSyncLog, updateSyncLog } from '../db/queries';
import { decrypt } from './encryption';
import { exportAllReports, type ExportResult } from './zsbmsExporter';
import { REPORT_BY_KEY, type ReportKey } from '../reportRegistry';

// Track running sync to prevent concurrent runs
let currentSyncId: number | null = null;

export function isRunning(): boolean {
  return currentSyncId !== null;
}

export function getCurrentSyncId(): number | null {
  return currentSyncId;
}

export async function runSync(triggerType: 'manual' | 'cron'): Promise<number> {
  if (currentSyncId !== null) {
    throw new Error('A sync is already running');
  }

  // 1. Read settings
  const settings = getSyncSettings();
  if (!settings || !settings.zsbms_username || !settings.zsbms_password_encrypted) {
    throw new Error('ZSBMS credentials not configured');
  }

  let password: string;
  try {
    password = decrypt(settings.zsbms_password_encrypted);
  } catch {
    throw new Error('Failed to decrypt ZSBMS password. Try saving credentials again.');
  }

  // 2. Create sync log
  const syncId = createSyncLog(triggerType);
  currentSyncId = syncId;

  // Run async — don't await (caller polls for status)
  doSync(syncId, settings.zsbms_username, password).catch(err => {
    console.error(`[Sync ${syncId}] Fatal error:`, err);
    updateSyncLog(syncId, {
      status: 'failed',
      error: err.message || String(err),
    });
    currentSyncId = null;
  });

  return syncId;
}

async function doSync(syncId: number, username: string, password: string): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lupita-sync-'));
  console.log(`[Sync ${syncId}] Starting sync, temp dir: ${tmpDir}`);

  try {
    // 3. Calculate date range (Jan 1 to today)
    const now = new Date();
    const dateFrom = `${now.getFullYear()}-01-01`;
    const dateTo = now.toISOString().split('T')[0];

    // 4. Download all reports
    console.log(`[Sync ${syncId}] Downloading reports ${dateFrom} to ${dateTo}...`);
    const exportResults = await exportAllReports(
      { username, password },
      { dateFrom, dateTo },
      tmpDir,
    );

    // 5. Import each successful report
    let totalInserted = 0;
    let totalUpdated = 0;
    let reportsSucceeded = 0;
    let reportsFailed = 0;
    const details: any[] = [];

    for (const exportResult of exportResults) {
      if (!exportResult.success) {
        reportsFailed++;
        details.push({
          report: exportResult.reportName,
          key: exportResult.reportKey,
          status: 'download_failed',
          error: exportResult.error,
        });
        continue;
      }

      try {
        console.log(`[Sync ${syncId}] Importing ${exportResult.reportName}...`);
        const reportDef = REPORT_BY_KEY.get(exportResult.reportKey as ReportKey);
        if (!reportDef) {
          throw new Error(`No import function registered for report: ${exportResult.reportKey}`);
        }
        const importResult = reportDef.importFn(exportResult.filePath);

        totalInserted += importResult.recordsInserted || 0;
        totalUpdated += importResult.recordsUpdated || 0;
        reportsSucceeded++;

        details.push({
          report: exportResult.reportName,
          key: exportResult.reportKey,
          status: 'success',
          inserted: importResult.recordsInserted,
          updated: importResult.recordsUpdated,
          errors: importResult.errors?.length > 0 ? importResult.errors : undefined,
        });
        console.log(`[Sync ${syncId}] ✓ ${exportResult.reportName}: +${importResult.recordsInserted} ins, +${importResult.recordsUpdated} upd`);
      } catch (err: any) {
        reportsFailed++;
        details.push({
          report: exportResult.reportName,
          key: exportResult.reportKey,
          status: 'import_failed',
          error: err.message,
        });
        console.error(`[Sync ${syncId}] ✗ ${exportResult.reportName}: ${err.message}`);
      }
    }

    // 6. Update sync log
    const finalStatus = reportsFailed === 0
      ? 'success'
      : reportsSucceeded > 0
        ? 'partial'
        : 'failed';

    updateSyncLog(syncId, {
      status: finalStatus,
      reports_succeeded: reportsSucceeded,
      reports_failed: reportsFailed,
      total_inserted: totalInserted,
      total_updated: totalUpdated,
      details: JSON.stringify(details),
    });

    console.log(`[Sync ${syncId}] Completed: ${finalStatus} (${reportsSucceeded}/${exportResults.length} reports, +${totalInserted} ins, +${totalUpdated} upd)`);
  } finally {
    // 7. Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      console.warn(`[Sync ${syncId}] Failed to cleanup temp dir: ${tmpDir}`);
    }
    currentSyncId = null;
  }
}
