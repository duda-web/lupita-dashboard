import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  computeKPIsWithComparison,
  computeMTD,
  computeYTD,
  computeProjection,
  ComparisonType,
} from '../services/metricsService';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, comparison = 'wow' } = req.query;

    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const result = computeKPIsWithComparison({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      comparison: comparison as ComparisonType,
    });

    res.json(result);
  } catch (err: any) {
    console.error('KPIs error:', err);
    res.status(500).json({ error: 'Erro ao calcular KPIs' });
  }
});

router.get('/mtd', (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    const result = computeMTD(storeId as string | undefined);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular MTD' });
  }
});

router.get('/ytd', (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    const result = computeYTD(storeId as string | undefined);
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

export default router;
