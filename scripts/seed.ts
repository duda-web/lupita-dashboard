import { initDb, getDb } from '../server/db/queries';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Initializing database...');
  initDb();

  const db = getDb();

  // Seed stores
  console.log('Seeding stores...');
  const upsertStore = db.prepare(`
    INSERT OR REPLACE INTO stores (store_id, display_name, raw_name, open_days, opened_date)
    VALUES (?, ?, ?, ?, ?)
  `);

  upsertStore.run('cais_do_sodre', 'Cais do Sodré', 'Lupita Pizza - Cais do Sodre (1)',
    '["mon","tue","wed","thu","fri","sat","sun"]', '2019-01-01');
  upsertStore.run('alvalade', 'Alvalade', 'Lupita Pizza - Alvalade (2)',
    '["wed","thu","fri","sat","sun"]', '2025-01-01');

  console.log('  ✓ 2 stores seeded');

  // Seed users
  console.log('Seeding users...');
  const upsertUser = db.prepare(`
    INSERT OR REPLACE INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `);

  const dudaHash = await bcrypt.hash('lupita2026', 10);
  const abudHash = await bcrypt.hash('lupita2026', 10);

  upsertUser.run('duda', dudaHash, 'admin');
  upsertUser.run('abud', abudHash, 'viewer');

  console.log('  ✓ 2 users seeded (duda: admin, abud: viewer)');
  console.log('  ⚠ Default password: lupita2026 — change after first login');

  console.log('\nSeed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
