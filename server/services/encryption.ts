/**
 * AES-256-GCM encryption/decryption for storing sensitive credentials.
 *
 * Key strategy: Uses a persistent encryption key stored in the SQLite database.
 * This survives Railway redeploys (DB is a mounted volume) unlike env vars
 * which can change between deploys and break decryption of stored passwords.
 *
 * Falls back to JWT_SECRET-derived key for backward compatibility during
 * the migration period — if decryption with the DB key fails, tries the
 * legacy JWT_SECRET-derived key and re-encrypts with the new stable key.
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const LEGACY_SALT = 'lupita-sync-salt';

// ─── DB-Persisted Key ───────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH || './lupita.db';

let cachedKey: Buffer | null = null;

/**
 * Get or create a persistent encryption key stored in the DB.
 * Auto-creates the `app_secrets` table and generates a random 256-bit key on first use.
 */
function getPersistedKey(): Buffer {
  if (cachedKey) return cachedKey;

  const db = new Database(path.resolve(__dirname, '../../', DB_PATH));
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    const row = db.prepare("SELECT value FROM app_secrets WHERE key = 'encryption_key'").get() as any;

    if (row) {
      cachedKey = Buffer.from(row.value, 'hex');
    } else {
      // Generate a new random 256-bit key and persist it
      cachedKey = crypto.randomBytes(32);
      db.prepare("INSERT INTO app_secrets (key, value) VALUES ('encryption_key', ?)").run(cachedKey.toString('hex'));
    }
  } finally {
    db.close();
  }

  return cachedKey;
}

// ─── Legacy Key (for backward compat) ───────────────────────────────

function deriveLegacyKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  return crypto.scryptSync(secret, LEGACY_SALT, 32);
}

// ─── Core Encryption / Decryption ───────────────────────────────────

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decryptWithKey(encoded: string, key: Buffer): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Public API ─────────────────────────────────────────────────────

export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, getPersistedKey());
}

export function decrypt(encoded: string): string {
  // Try the persisted DB key first
  try {
    return decryptWithKey(encoded, getPersistedKey());
  } catch {
    // Fall through to legacy key
  }

  // Try the legacy JWT_SECRET-derived key (backward compat)
  return decryptWithKey(encoded, deriveLegacyKey());
}
