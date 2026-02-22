import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  computeKPIsWithComparison,
  computeMTD,
  computeYTD,
  computeProjection,
  ComparisonType,
} from '../services/metricsService';
import { getLastSalesDate } from '../db/queries';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, comparison = 'wow', channel = 'all' } = req.query;

    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const result = computeKPIsWithComparison({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      comparison: comparison as ComparisonType,
      channel: channel as 'all' | 'loja' | 'delivery',
    });

    res.json(result);
  } catch (err: any) {
    console.error('KPIs error:', err);
    res.status(500).json({ error: 'Erro ao calcular KPIs' });
  }
});

router.get('/mtd', (req: Request, res: Response) => {
  try {
    const { storeId, channel = 'all' } = req.query;
    const result = computeMTD(storeId as string | undefined, channel as 'all' | 'loja' | 'delivery');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular MTD' });
  }
});

router.get('/ytd', (req: Request, res: Response) => {
  try {
    const { storeId, channel = 'all' } = req.query;
    const result = computeYTD(storeId as string | undefined, channel as 'all' | 'loja' | 'delivery');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular YTD' });
  }
});

router.get('/projection', (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    const result = computeProjection(storeId as string | undefined);
    res.json(result);
  } catch (err: any) {
    console.error('Projection error:', err);
    res.status(500).json({ error: 'Erro ao calcular projeção' });
  }
});

router.get('/last-sales-date', (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const lastDate = getLastSalesDate(storeId);
    res.json({ lastDate });
  } catch (err: any) {
    console.error('Last sales date error:', err);
    res.status(500).json({ error: 'Erro ao obter última data de vendas' });
  }
});

export default router;
