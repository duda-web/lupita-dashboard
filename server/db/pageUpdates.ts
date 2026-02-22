import { getDb } from './queries';

/**
 * PAGE UPDATES REGISTRY
 *
 * Para marcar uma página como tendo novidades, adicionar/actualizar aqui.
 * Alterar a data para a data actual para que todos os utilizadores vejam "NEW".
 * Quando o utilizador visitar a página, o badge desaparece para ele.
 *
 * page_path deve corresponder ao path do React Router (ex: '/hourly', '/insights')
 */
const PAGE_UPDATES: Array<{
  page_path: string;
  updated_at: string; // formato: 'YYYY-MM-DD HH:MM:SS'
  description: string;
}> = [
  // Adicionar aqui quando houver uma actualização significativa numa página.
  // Exemplo:
  // { page_path: '/hourly', updated_at: '2026-03-01 00:00:00', description: 'Novo gráfico de tendências' },
];

/**
 * Sincroniza o array PAGE_UPDATES com a base de dados.
 * Chamado uma vez ao iniciar o servidor via initDb().
 * Idempotente: usa ON CONFLICT para actualizar entradas existentes.
 */
export function syncPageUpdates(): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO page_updates (page_path, updated_at, description)
    VALUES (?, ?, ?)
    ON CONFLICT(page_path) DO UPDATE SET
      updated_at = excluded.updated_at,
      description = excluded.description
  `);

  const syncAll = db.transaction(() => {
    // Upsert entradas actuais
    for (const update of PAGE_UPDATES) {
      upsert.run(update.page_path, update.updated_at, update.description);
    }

    // Remover da BD páginas que já não estejam no array
    const activePaths = PAGE_UPDATES.map((u) => u.page_path);
    if (activePaths.length === 0) {
      db.prepare('DELETE FROM page_updates').run();
    } else {
      const placeholders = activePaths.map(() => '?').join(',');
      db.prepare(`DELETE FROM page_updates WHERE page_path NOT IN (${placeholders})`).run(...activePaths);
    }
  });

  syncAll();
}
