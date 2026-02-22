/**
 * Cron Scheduler for ZSBMS Sync
 *
 * Manages a node-cron task that triggers automatic sync.
 * Default schedule: every Monday at 7:00 AM (0 7 * * 1).
 */

import cron from 'node-cron';
import { getSyncSettings } from '../db/queries';
import { runSync, isRunning } from './syncService';

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Initialize the cron scheduler on server startup.
 * Reads the current settings and starts the cron if auto_sync is enabled.
 */
export function initCron(): void {
  const settings = getSyncSettings();
  if (!settings) {
    console.log('[Cron] No sync settings found, cron not started');
    return;
  }

  if (!settings.auto_sync_enabled) {
    console.log('[Cron] Auto-sync is disabled');
    return;
  }

  const expression = settings.cron_expression || '0 7 * * 1';
  startCron(expression);
}

/**
 * Start or restart the cron task with the given expression.
 */
function startCron(expression: string): void {
  // Validate expression
  if (!cron.validate(expression)) {
    console.error(`[Cron] Invalid cron expression: ${expression}`);
    return;
  }

  // Stop existing task if any
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  scheduledTask = cron.schedule(expression, async () => {
    console.log(`[Cron] Triggered automatic sync at ${new Date().toISOString()}`);

    if (isRunning()) {
      console.log('[Cron] Sync already running, skipping');
      return;
    }

    // Check if settings still have credentials
    const settings = getSyncSettings();
    if (!settings?.zsbms_username || !settings?.zsbms_password_encrypted) {
      console.log('[Cron] No credentials configured, skipping');
      return;
    }

    try {
      const syncId = await runSync('cron');
      console.log(`[Cron] Sync started with ID ${syncId}`);
    } catch (err: any) {
      console.error(`[Cron] Failed to start sync: ${err.message}`);
    }
  });

  console.log(`[Cron] Scheduled auto-sync: ${expression}`);
}

/**
 * Reschedule the cron task (called when settings change).
 */
export function rescheduleCron(enabled: boolean, expression?: string): void {
  if (!enabled) {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
      console.log('[Cron] Auto-sync disabled, cron stopped');
    }
    return;
  }

  const expr = expression || '0 7 * * 1';
  startCron(expr);
}
