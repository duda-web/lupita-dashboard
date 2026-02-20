import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getChartData } from '../services/metricsService';

const router = Router();
router.use(authMiddleware);

router.get('/:type', (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { dateFrom, dateTo, storeId, channel } = req.query;

    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const validTypes = ['weekly_revenue', 'weekly_ticket', 'day_of_week', 'monthly', 'heatmap', 'target', 'customers', 'zone_mix', 'zone_trend', 'top_articles', 'family_mix', 'article_trend', 'articles_by_store', 'channel_split', 'category_mix'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `Tipo inválido. Opções: ${validTypes.join(', ')}` });
      return;
    }

    const data = getChartData({
      type: type as any,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      channel: (channel as string | undefined) || 'all',
    });

    res.json(data);
  } catch (err: any) {
    console.error('Charts error:', err);
    res.status(500).json({ error: 'Erro ao obter dados do gráfico' });
  }
});

export default router;
