import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDailySales } from '../db/queries';

const router = Router();
router.use(authMiddleware);

router.get('/csv', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId } = req.query;

    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const data = getDailySales({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
    }) as any[];

    // Build CSV
    const headers = [
      'Data', 'Dia', 'Loja', 'Faturação (c/ IVA)', 'Faturação (s/ IVA)',
      'IVA', 'Nº Tickets', 'Ticket Médio', 'Nº Clientes', 'VM Pessoa',
      'Objectivo', 'Variação vs Obj. (%)',
    ];

    const storeNames: Record<string, string> = {
      cais_do_sodre: 'Cais do Sodré',
      alvalade: 'Alvalade',
    };

    const rows = data.map((row) => {
      const variation = row.target_gross > 0
        ? (((row.total_gross - row.target_gross) / row.target_gross) * 100).toFixed(1)
        : '';
      return [
        row.date,
        row.day_of_week,
        storeNames[row.store_id] || row.store_id,
        row.total_gross.toFixed(2).replace('.', ','),
        row.total_net.toFixed(2).replace('.', ','),
        row.total_vat.toFixed(2).replace('.', ','),
        row.num_tickets,
        row.avg_ticket.toFixed(2).replace('.', ','),
        row.num_customers,
        row.avg_per_customer.toFixed(2).replace('.', ','),
        row.target_gross.toFixed(2).replace('.', ','),
        variation,
      ].join(';');
    });

    const csv = [headers.join(';'), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lupita_${dateFrom}_${dateTo}.csv"`);
    // Add BOM for Excel to detect UTF-8
    res.send('\uFEFF' + csv);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao exportar CSV' });
  }
});

// Daily detail data (JSON)
router.get('/daily', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId } = req.query;

    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const data = getDailySales({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao obter dados diários' });
  }
});

export default router;
