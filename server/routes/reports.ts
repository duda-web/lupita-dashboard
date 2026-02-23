/**
 * Reports Routes — Serves report registry metadata to the frontend.
 *
 * GET /api/reports/registry — Display info for all ZSBMS reports
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDisplayRegistry } from '../reportRegistry';

const router = Router();
router.use(authMiddleware);

router.get('/registry', (_req: Request, res: Response) => {
  try {
    res.json(getDisplayRegistry());
  } catch (err: any) {
    console.error('Reports registry error:', err);
    res.status(500).json({ error: 'Erro ao obter registo de relatórios' });
  }
});

export default router;
