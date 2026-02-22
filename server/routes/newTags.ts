import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getNewPagesForUser, markPageViewed } from '../db/queries';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/new-tags
 * Retorna array de page paths com actualizações não vistas pelo utilizador.
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const pages = getNewPagesForUser(userId);
    res.json({ pages });
  } catch (err: any) {
    console.error('New tags error:', err);
    res.status(500).json({ error: 'Erro ao obter tags de novidades' });
  }
});

/**
 * POST /api/new-tags/mark-seen
 * Marca uma página como visitada pelo utilizador.
 * Body: { pagePath: '/hourly' }
 */
router.post('/mark-seen', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { pagePath } = req.body;

    if (!pagePath || typeof pagePath !== 'string') {
      res.status(400).json({ error: 'pagePath é obrigatório' });
      return;
    }

    markPageViewed(userId, pagePath);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Mark seen error:', err);
    res.status(500).json({ error: 'Erro ao marcar página como vista' });
  }
});

export default router;
