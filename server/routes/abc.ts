import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getABCRanking,
  getABCDistribution,
  getABCPareto,
  getABCEvolution,
  getABCStoreComparison,
  getABCConcentration,
  getABCDateRange,
} from '../db/queries';

const router = Router();
router.use(authMiddleware);

// ABC date range
router.get('/date-range', (req: Request, res: Response) => {
  try {
    const range = getABCDateRange();
    res.json(range);
  } catch (err: any) {
    console.error('ABC date-range error:', err);
    res.status(500).json({ error: 'Erro ao obter intervalo de datas ABC' });
  }
});

// ABC Ranking
router.get('/ranking', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCRanking({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC ranking error:', err);
    res.status(500).json({ error: 'Erro ao obter ranking ABC' });
  }
});

// ABC Distribution
router.get('/distribution', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCDistribution({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC distribution error:', err);
    res.status(500).json({ error: 'Erro ao obter distribuição ABC' });
  }
});

// ABC Pareto
router.get('/pareto', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCPareto({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC pareto error:', err);
    res.status(500).json({ error: 'Erro ao obter dados Pareto ABC' });
  }
});

// ABC Evolution (ranking over time)
router.get('/evolution', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCEvolution({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC evolution error:', err);
    res.status(500).json({ error: 'Erro ao obter evolução ABC' });
  }
});

// ABC Store comparison
router.get('/store-comparison', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCStoreComparison({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC store comparison error:', err);
    res.status(500).json({ error: 'Erro ao obter comparação entre lojas ABC' });
  }
});

// ABC Concentration
router.get('/concentration', (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category, channel } = req.query;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }
    const data = getABCConcentration({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      storeId: storeId as string | undefined,
      category: (category as string) || undefined,
      channel: (channel as 'all' | 'loja' | 'delivery') || 'all',
    });
    res.json(data);
  } catch (err: any) {
    console.error('ABC concentration error:', err);
    res.status(500).json({ error: 'Erro ao obter concentração ABC' });
  }
});

// AI Insights endpoint
router.post('/insights', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, storeId, category } = req.body;
    if (!dateFrom || !dateTo) {
      res.status(400).json({ error: 'dateFrom e dateTo são obrigatórios' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(200).json({
        error: 'api_key_missing',
        message: 'Configure a chave da API Anthropic no ficheiro .env para activar os insights por IA',
      });
      return;
    }

    // Gather data for insights — filter out inactive articles
    const rankingFull = getABCRanking({ dateFrom, dateTo, storeId, category });
    const ranking = rankingFull.filter((a: any) => !a.inactive);
    const inactiveCount = rankingFull.length - ranking.length;
    const distribution = getABCDistribution({ dateFrom, dateTo, storeId, category });
    const concentration = getABCConcentration({ dateFrom, dateTo, storeId, category });

    const topArticles = ranking.slice(0, 10);
    const bottomArticles = ranking.slice(-5);

    // Build prompt with dual-dimension data
    const dataPayload = {
      period: { dateFrom, dateTo },
      store: storeId || 'all',
      category: category || 'all',
      classification_method: 'ABC Bidimensional (Valor × Quantidade), limiares: A≤70%, B≤90%, C>90%',
      inactive_articles_excluded: inactiveCount,
      note: inactiveCount > 0
        ? `${inactiveCount} artigos inativos (sem vendas nos últimos 14 dias) foram excluídos. Estes já saíram do menu e não devem influenciar recomendações.`
        : undefined,
      matrix_semantics: {
        AA: 'Estrela Absoluta — top faturação E top quantidade',
        AB: 'Premium — alta faturação, quantidade média',
        AC: 'Premium Nicho — alta faturação, pouca quantidade (artigo caro)',
        BA: 'Popular Barato — faturação média, muita quantidade (candidato a subir preço)',
        BB: 'Core — equilibrado',
        BC: 'Oportunidade — faturação média, pouca quantidade',
        CA: 'Subvalorizado — baixa faturação, muita quantidade (subir preço!)',
        CB: 'Baixo — baixa faturação, quantidade média',
        CC: 'Candidato a Sair — baixo em tudo (sair do menu?)',
      },
      summary: {
        total_articles: ranking.length,
        total_revenue: concentration.total_value,
        matrix_distribution: distribution.matrix,
        value_distribution: distribution.byValue,
        qty_distribution: distribution.byQty,
        concentration: {
          top5_pct: concentration.top5_pct,
          top10_pct: concentration.top10_pct,
          top20_pct: concentration.top20_pct,
        },
      },
      top10: topArticles.map((a: any) => ({
        name: a.article_name,
        value: a.total_value,
        qty: a.total_qty,
        value_pct: (a.value_pct * 100).toFixed(1),
        abc_class: a.abc_class,
        abc_value: a.abc_value,
        abc_qty: a.abc_qty,
      })),
      bottom5: bottomArticles.map((a: any) => ({
        name: a.article_name,
        value: a.total_value,
        qty: a.total_qty,
        abc_class: a.abc_class,
        abc_value: a.abc_value,
        abc_qty: a.abc_qty,
      })),
    };

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `És um analista de negócios de restauração. Analisa os dados ABC bidimensional (Valor × Quantidade) de vendas de uma cadeia de pizzarias e gera insights accionáveis em português (PT-PT).

A classificação ABC é bidimensional com limiares 70/90:
- Primeira letra = classe por VALOR (faturação), Segunda letra = classe por QUANTIDADE
- AA = Estrela Absoluta, AB/AC = Premium, BA/CA = Popular/Subvalorizado, CC = Candidato a sair
- Artigos CA são especialmente importantes: vendem muito mas faturam pouco → candidatos fortes a subida de preço
- Artigos AC são nichos premium: faturam bem mas vendem pouco → proteger e valorizar

REGRA IMPORTANTE SOBRE ARTIGOS INATIVOS:
Os dados que recebes já EXCLUEM artigos inativos (sem vendas nos últimos 14 dias) — são artigos que já saíram do menu.
- NÃO recomendardes retirar artigos que já não existem no menu.
- Quando analisares artigos CC, refere-te a eles como artigos ACTIVOS no menu actual que vendem pouco — estes sim merecem atenção.
- Se o campo "inactive_articles_excluded" > 0, podes mencionar brevemente que X artigos inativos foram excluídos da análise.
- Contudo, se a saída de artigos antigos ajudar a explicar tendências (ex: concentração, mudança de mix), podes mencioná-lo como contexto histórico.
- O foco dos insights deve ser sempre o PRESENTE e o FUTURO do menu actual.

Formato da resposta: Markdown com secções curtas (3-5 bullet points por secção).
Secções sugeridas:
- 📊 Resumo Executivo (2-3 frases, incluir distribuição na matriz)
- 🌟 Estrelas (AA) e Premium (AB/AC) — o que os destaca
- 🔥 Populares Baratos (BA/CA) — oportunidades de repricing
- ⚠️ Pontos de Atenção (CC activos, concentração excessiva, dependência)
- 💡 Recomendações (acções concretas para optimizar mix e preços do menu actual)

Sê directo, concreto e orientado para a acção. Usa nomes reais dos artigos. Valores em euros.`,
        messages: [
          {
            role: 'user',
            content: `Analisa estes dados ABC do período ${dateFrom} a ${dateTo}${category && category !== 'all' ? ` (categoria: ${category})` : ''}:\n\n${JSON.stringify(dataPayload, null, 2)}`,
          },
        ],
      });

      const textContent = message.content.find((c: any) => c.type === 'text');
      const insights = textContent ? (textContent as any).text : 'Sem resposta';

      res.json({
        insights,
        generated_at: new Date().toISOString(),
      });
    } catch (aiErr: any) {
      console.error('AI Insights error:', aiErr);
      res.status(500).json({
        error: 'ai_error',
        message: `Erro ao gerar insights: ${aiErr.message}`,
      });
    }
  } catch (err: any) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Erro ao gerar insights' });
  }
});

export default router;
