/**
 * Sync Routes — Admin-only endpoints for ZSBMS PRO sync management.
 *
 * GET    /api/sync/settings  — Get sync settings (never exposes password)
 * PUT    /api/sync/settings  — Save credentials + config
 * POST   /api/sync/trigger   — Start a manual sync
 * GET    /api/sync/status    — Get latest sync status (for polling)
 * GET    /api/sync/history   — List past syncs
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/authMiddleware';
import {
  getSyncSettings,
  upsertSyncSettings,
  getLatestSync,
  getSyncHistory,
} from '../db/queries';
import { encrypt } from '../services/encryption';
import { runSync, isRunning, getCurrentSyncId } from '../services/syncService';
import { rescheduleCron } from '../services/cronScheduler';

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// ─── GET /api/sync/settings ───

router.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = getSyncSettings();
    if (!settings) {
      res.json({
        zsbms_username: '',
        has_password: false,
        auto_sync_enabled: false,
        cron_expression: '0 7 * * 1',
      });
      return;
    }

    res.json({
      zsbms_username: settings.zsbms_username || '',
      has_password: !!settings.zsbms_password_encrypted,
      auto_sync_enabled: !!settings.auto_sync_enabled,
      cron_expression: settings.cron_expression || '0 7 * * 1',
    });
  } catch (err: any) {
    console.error('Sync settings GET error:', err);
    res.status(500).json({ error: 'Erro ao obter definições de sincronização' });
  }
});

// ─── PUT /api/sync/settings ───

router.put('/settings', (req: Request, res: Response) => {
  try {
    const { username, password, auto_sync_enabled, cron_expression } = req.body;

    const updateData: any = {};

    if (username !== undefined) {
      updateData.zsbms_username = username;
    }

    if (password !== undefined && password !== '') {
      updateData.zsbms_password_encrypted = encrypt(password);
    }

    if (auto_sync_enabled !== undefined) {
      updateData.auto_sync_enabled = auto_sync_enabled;
    }

    if (cron_expression !== undefined) {
      updateData.cron_expression = cron_expression;
    }

    upsertSyncSettings(updateData);

    // Reschedule cron if auto_sync settings changed
    if (auto_sync_enabled !== undefined || cron_expression !== undefined) {
      const settings = getSyncSettings();
      rescheduleCron(
        !!settings?.auto_sync_enabled,
        settings?.cron_expression,
      );
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('Sync settings PUT error:', err);
    res.status(500).json({ error: 'Erro ao guardar definições' });
  }
});

// ─── POST /api/sync/trigger ───

router.post('/trigger', async (req: Request, res: Response) => {
  try {
    if (isRunning()) {
      res.status(409).json({
        error: 'Sincronização já em curso',
        syncId: getCurrentSyncId(),
      });
      return;
    }

    const syncId = await runSync('manual');
    res.json({ ok: true, syncId });
  } catch (err: any) {
    console.error('Sync trigger error:', err);
    res.status(500).json({ error: err.message || 'Erro ao iniciar sincronização' });
  }
});

// ─── GET /api/sync/status ───

router.get('/status', (_req: Request, res: Response) => {
  try {
    const latest = getLatestSync();
    res.json({
      running: isRunning(),
      currentSyncId: getCurrentSyncId(),
      latest: latest || null,
    });
  } catch (err: any) {
    console.error('Sync status error:', err);
    res.status(500).json({ error: 'Erro ao obter estado da sincronização' });
  }
});

// ─── GET /api/sync/history ───

router.get('/history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = getSyncHistory(limit);
    res.json(history);
  } catch (err: any) {
    console.error('Sync history error:', err);
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

export default router;
