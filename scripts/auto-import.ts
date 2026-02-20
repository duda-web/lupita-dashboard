/**
 * Auto-import script for cron/launchd
 * Reads .xlsx files from /data/inbox, auto-detects type, imports them, and moves to /data/processed
 *
 * Supports:
 *   - "Apuramento Completo" (financial data)
 *   - "Apuramento Zonas" (zone revenue data)
 *
 * Usage: npx tsx scripts/auto-import.ts
 *
 * Cron example (every Monday at 06:00):
 *   0 6 * * 1 cd /path/to/lupita-dashboard && npx tsx scripts/auto-import.ts >> /var/log/lupita-import.log 2>&1
 */

import fs from 'fs';
import path from 'path';
import { initDb } from '../server/db/queries';
import { importXlsxFile, importZoneFile, detectFileType } from '../server/services/importService';

const INBOX_DIR = path.resolve(__dirname, '../data/inbox');
const PROCESSED_DIR = path.resolve(__dirname, '../data/processed');
const ERRORS_DIR = path.resolve(__dirname, '../data/errors');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getProcessedSubdir(): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return path.join(PROCESSED_DIR, yearMonth);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Lupita Auto-Import starting...`);

  // Init DB
  initDb();

  ensureDir(INBOX_DIR);
  ensureDir(PROCESSED_DIR);
  ensureDir(ERRORS_DIR);

  // Find xlsx files in inbox
  const files = fs.readdirSync(INBOX_DIR).filter(
    (f: string) => f.endsWith('.xlsx') || f.endsWith('.xls')
  );

  if (files.length === 0) {
    console.log('  No files found in inbox. Exiting.');
    return;
  }

  console.log(`  Found ${files.length} file(s) to process.`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const filename of files) {
    const filePath = path.join(INBOX_DIR, filename);
    console.log(`\n  Processing: ${filename}`);

    try {
      // Auto-detect file type
      const fileType = detectFileType(filePath);
      console.log(`    Detected type: ${fileType}`);

      if (fileType === 'zonas') {
        const result = importZoneFile(filePath);
        console.log(`    Inserted: ${result.recordsInserted}, Updated: ${result.recordsUpdated}`);
        if (result.dateFrom && result.dateTo) {
          console.log(`    Period: ${result.dateFrom} to ${result.dateTo}`);
        }
        if (result.errors.length > 0) {
          console.log(`    Warnings: ${result.errors.length}`);
          result.errors.forEach((err: string) => console.log(`      - ${err}`));
        }
        totalInserted += result.recordsInserted;
        totalUpdated += result.recordsUpdated;

      } else if (fileType === 'apuramento') {
        const result = importXlsxFile(filePath);
        console.log(`    Inserted: ${result.recordsInserted}, Updated: ${result.recordsUpdated}`);
        if (result.dateFrom && result.dateTo) {
          console.log(`    Period: ${result.dateFrom} to ${result.dateTo}`);
        }
        if (result.errors.length > 0) {
          console.log(`    Warnings: ${result.errors.length}`);
          result.errors.forEach((err: string) => console.log(`      - ${err}`));
        }
        totalInserted += result.recordsInserted;
        totalUpdated += result.recordsUpdated;

      } else {
        console.log(`    SKIPPED: Unknown file type`);
        const newName = `${timestamp()}_${filename}`;
        fs.renameSync(filePath, path.join(ERRORS_DIR, newName));
        console.log(`    Moved to: errors/${newName}`);
        totalErrors++;
        continue;
      }

      // Move to processed
      const processedDir = getProcessedSubdir();
      ensureDir(processedDir);
      const newName = `${timestamp()}_${filename}`;
      fs.renameSync(filePath, path.join(processedDir, newName));
      console.log(`    Moved to: processed/${path.basename(processedDir)}/${newName}`);

    } catch (err: any) {
      console.error(`    ERROR: ${err.message}`);
      totalErrors++;

      // Move to errors
      const newName = `${timestamp()}_${filename}`;
      fs.renameSync(filePath, path.join(ERRORS_DIR, newName));
      console.log(`    Moved to: errors/${newName}`);
    }
  }

  console.log(`\n  Summary: ${totalInserted} inserted, ${totalUpdated} updated, ${totalErrors} errors`);
  console.log(`[${new Date().toISOString()}] Auto-Import complete.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
