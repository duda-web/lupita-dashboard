import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getKPIs,
  getKPIsByStore,
  getDayOfWeekData,
  getTopArticles,
  getZoneMix,
  getChannelSplit,
  getCategoryMix,
  getFamilyMix,
  getArticlesByStore,
  getProjectionData,
  getABCRanking,
  getABCDistribution,
  getABCConcentration,
  saveInsight,
  getInsightsHistory,
  getInsightById,
  getLastSalesDate,
  getHourlyBySlot,
} from '../db/queries';
import { getComparisonPeriod } from '../services/metricsService';
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  subMonths,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  lastDayOfMonth,
} from 'date-fns';

const router = Router();
router.use(authMiddleware);

// ─── Helpers ───

const STORE_DISPLAY_NAMES: Record<string, string> = {
  cais_do_sodre: 'Cais do Sodré',
  alvalade: 'Alvalade',
};

function calculateDateRange(
  period: string,
  storeId?: string,
  dateFrom?: string,
  dateTo?: string
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  // Use last date with actual sales instead of "today"
  const effectiveDateTo = getLastSalesDate(storeId);

  switch (period) {
    case 'week': {
      const lastWeek = subWeeks(now, 1);
      return {
        dateFrom: format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        dateTo: format(endOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      };
    }
    case 'month':
      return {
        dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'),
        dateTo: effectiveDateTo,
      };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return {
        dateFrom: format(startOfMonth(lm), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(lm), 'yyyy-MM-dd'),
      };
    }
    case 'year':
      return {
        dateFrom: format(startOfYear(now), 'yyyy-MM-dd'),
        dateTo: effectiveDateTo,
      };
    case 'last_year': {
      const ly = subYears(now, 1);
      return {
        dateFrom: format(startOfYear(ly), 'yyyy-MM-dd'),
        dateTo: format(endOfYear(ly), 'yyyy-MM-dd'),
      };
    }
    case 'custom':
      if (!dateFrom || !dateTo) throw new Error('dateFrom e dateTo obrigatórios para período personalizado');
      return { dateFrom, dateTo };
    default:
      throw new Error(`Período inválido: ${period}`);
  }
}

function getComparisonTypeForPeriod(period: string): 'wow' | 'mom' | 'yoy' {
  switch (period) {
    case 'week': return 'wow';
    case 'month':
    case 'last_month': return 'mom';
    case 'year':
    case 'last_year': return 'yoy';
    default: return 'mom';
  }
}

function calcVariation(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── POST /api/insights/generate ───

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { period, dateFrom: customFrom, dateTo: customTo, storeId, channel } = req.body;

    if (!period || !['week', 'month', 'last_month', 'year', 'last_year', 'custom'].includes(period)) {
      res.status(400).json({ error: 'period obrigatório: week | month | last_month | year | last_year | custom' });
      return;
    }

    // 1. Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(200).json({
        error: 'api_key_missing',
        message: 'Configure a chave da API Anthropic no ficheiro .env para activar os insights por IA',
      });
      return;
    }

    // 2. Calculate date ranges
    let range: { dateFrom: string; dateTo: string };
    try {
      range = calculateDateRange(period, storeId, customFrom, customTo);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const { dateFrom, dateTo } = range;
    const compType = getComparisonTypeForPeriod(period);
    const prevPeriod = getComparisonPeriod(dateFrom, dateTo, compType);
    const includeABC = ['month', 'last_month', 'year', 'last_year'].includes(period);
    const includeProjection = period === 'month';
    const effectiveChannel = channel || 'all';

    // 3. Gather ALL data
    const baseParams = { dateFrom, dateTo, storeId };

    // KPIs
    const currentKPIs = getKPIs(baseParams) as any;
    const previousKPIs = getKPIs({
      dateFrom: prevPeriod.dateFrom,
      dateTo: prevPeriod.dateTo,
      storeId,
    }) as any;

    // Store breakdown (when viewing all stores)
    const storeBreakdown = !storeId
      ? (getKPIsByStore({ dateFrom, dateTo }) as any[])
      : [];
    const prevStoreBreakdown = !storeId
      ? (getKPIsByStore({ dateFrom: prevPeriod.dateFrom, dateTo: prevPeriod.dateTo }) as any[])
      : [];

    // Top articles
    const top10Articles = getTopArticles({ dateFrom, dateTo, storeId, limit: 10, channel: 'all' }) as any[];
    const top5Loja = getTopArticles({ dateFrom, dateTo, storeId, limit: 5, channel: 'loja' }) as any[];
    const top5Delivery = getTopArticles({ dateFrom, dateTo, storeId, limit: 5, channel: 'delivery' }) as any[];

    // Category mix
    const categoryMix = getCategoryMix({ dateFrom, dateTo, storeId, channel: effectiveChannel as any }) as any[];

    // Family mix (broader families: PIZZAS, VINHOS, CERVEJA, etc.)
    const familyMix = getFamilyMix({ dateFrom, dateTo, storeId }) as any[];

    // Articles by store (top 10 per store — for cross-store menu engineering)
    const articlesByStore = !storeId
      ? (getArticlesByStore({ dateFrom, dateTo, limit: 10 }) as any[])
      : [];

    // Channel split (current + previous period for mix evolution)
    const channelSplit = getChannelSplit({ dateFrom, dateTo, storeId }) as any;
    const prevChannelSplit = getChannelSplit({
      dateFrom: prevPeriod.dateFrom,
      dateTo: prevPeriod.dateTo,
      storeId,
    }) as any;

    // Zone mix
    const zoneMix = getZoneMix({ dateFrom, dateTo, storeId }) as any;

    // Day of week patterns
    const dayOfWeek = getDayOfWeekData({ dateFrom, dateTo }) as any[];

    // Hourly revenue by slot
    const hourlySlots = getHourlyBySlot({ dateFrom, dateTo, storeId }) as any[];

    // Projection (month only)
    let projectionData: any = null;
    if (includeProjection) {
      const now = new Date();
      const monthEnd = format(lastDayOfMonth(now), 'yyyy-MM-dd');
      projectionData = getProjectionData({ dateFrom, dateTo: monthEnd, storeId });
    }

    // ABC data (month + year only) — filter out inactive articles for actionable insights
    let abcData: any = null;
    if (includeABC) {
      const abcRankingFull = getABCRanking({ dateFrom, dateTo, storeId }) as any[];
      const abcRanking = abcRankingFull.filter((a: any) => !a.inactive);
      const inactiveCount = abcRankingFull.length - abcRanking.length;
      if (abcRanking.length > 0) {
        const abcDistribution = getABCDistribution({ dateFrom, dateTo, storeId }) as any;
        const abcConcentration = getABCConcentration({ dateFrom, dateTo, storeId }) as any;

        abcData = {
          total_articles: abcRanking.length,
          inactive_articles_excluded: inactiveCount,
          note: inactiveCount > 0
            ? `${inactiveCount} artigos inativos (sem vendas nos últimos 14 dias) foram excluídos desta análise. Estes artigos já saíram do menu e não devem influenciar recomendações sobre o portfolio actual.`
            : undefined,
          concentration: {
            total_articles: abcConcentration.total_articles,
            top5_pct: round2(abcConcentration.top5_pct),
            top5_value: round2(abcConcentration.top5_value || 0),
            top10_pct: round2(abcConcentration.top10_pct),
            top10_value: round2(abcConcentration.top10_value || 0),
            top20_pct: round2(abcConcentration.top20_pct),
            top20_value: round2(abcConcentration.top20_value || 0),
            total_value: round2(abcConcentration.total_value || 0),
          },
          matrix_distribution: abcDistribution.matrix,
          value_distribution: abcDistribution.byValue,
          qty_distribution: abcDistribution.byQty,
          top10: abcRanking.slice(0, 10).map((a: any) => ({
            name: a.article_name,
            value: round2(a.total_value),
            qty: a.total_qty,
            value_pct: round2(a.value_pct * 100),
            abc_class: a.abc_class,
            abc_value: a.abc_value,
            abc_qty: a.abc_qty,
          })),
          bottom5: abcRanking.slice(-5).map((a: any) => ({
            name: a.article_name,
            value: round2(a.total_value),
            qty: a.total_qty,
            abc_class: a.abc_class,
            abc_value: a.abc_value,
            abc_qty: a.abc_qty,
          })),
          matrix_semantics: {
            AA: 'Estrela Absoluta — top faturação E top quantidade',
            AB: 'Premium — alta faturação, quantidade média',
            AC: 'Premium Nicho — alta faturação, pouca quantidade',
            BA: 'Popular Barato — faturação média, muita quantidade',
            BB: 'Core — equilibrado',
            BC: 'Oportunidade — faturação média, pouca quantidade',
            CA: 'Subvalorizado — baixa faturação, muita quantidade (subir preço!)',
            CB: 'Baixo — baixa faturação, quantidade média',
            CC: 'Candidato a Sair — baixo em tudo',
          },
        };
      }
    }

    // 4. Calculate derived metrics
    const totalRev = currentKPIs.total_revenue || 0;
    const totalTix = currentKPIs.total_tickets || 0;
    const totalCust = currentKPIs.total_customers || 0;
    const totalItems = currentKPIs.total_items || 0;
    const openDays = currentKPIs.open_days || 0;
    const prevRev = previousKPIs.total_revenue || 0;
    const prevTix = previousKPIs.total_tickets || 0;
    const prevCust = previousKPIs.total_customers || 0;
    const prevItems = previousKPIs.total_items || 0;
    const prevOpenDays = previousKPIs.open_days || 0;

    const avgTicketCurr = totalTix > 0 ? totalRev / totalTix : 0;
    const avgTicketPrev = prevTix > 0 ? prevRev / prevTix : 0;
    const avgPerCustCurr = totalCust > 0 ? totalRev / totalCust : 0;
    const avgPerCustPrev = prevCust > 0 ? prevRev / prevCust : 0;
    const avgItemsPerTicketCurr = totalTix > 0 ? totalItems / totalTix : 0;
    const avgItemsPerTicketPrev = prevTix > 0 ? prevItems / prevTix : 0;
    const avgDailyRevCurr = openDays > 0 ? totalRev / openDays : 0;
    const avgDailyRevPrev = prevOpenDays > 0 ? prevRev / prevOpenDays : 0;

    // 5. Build payload
    const compLabel = compType === 'wow' ? 'semana anterior' : compType === 'mom' ? 'mês anterior' : 'ano anterior';
    const periodLabel =
      period === 'week' ? 'Semana Passada' :
      period === 'month' ? 'Este Mês' :
      period === 'last_month' ? 'Mês Passado' :
      period === 'year' ? 'Este Ano' :
      period === 'last_year' ? 'Ano Passado' : 'Personalizado';

    const dataPayload: any = {
      context: {
        restaurant: 'Lupita Pizzaria',
        stores: ['Cais do Sodré', 'Alvalade'],
        period: { type: period, label: periodLabel, dateFrom, dateTo },
        comparison: { type: compType, label: compLabel, dateFrom: prevPeriod.dateFrom, dateTo: prevPeriod.dateTo },
        store_filter: storeId ? (STORE_DISPLAY_NAMES[storeId] || storeId) : 'Todas',
        channel_filter: effectiveChannel === 'all' ? 'Todos os canais' : effectiveChannel === 'loja' ? 'Restaurante' : 'Delivery',
      },
      financial_performance: {
        current: {
          revenue: round2(totalRev),
          tickets: totalTix,
          customers: totalCust,
          avg_ticket: round2(avgTicketCurr),
          avg_per_customer: round2(avgPerCustCurr),
          avg_items_per_ticket: round2(avgItemsPerTicketCurr),
          open_days: openDays,
          avg_daily_revenue: round2(avgDailyRevCurr),
          target: round2(currentKPIs.total_target || 0),
          target_variation: currentKPIs.total_target > 0
            ? round2(((totalRev - currentKPIs.total_target) / currentKPIs.total_target) * 100)
            : null,
        },
        previous: {
          revenue: round2(prevRev),
          tickets: prevTix,
          customers: prevCust,
          avg_ticket: round2(avgTicketPrev),
          avg_per_customer: round2(avgPerCustPrev),
          avg_items_per_ticket: round2(avgItemsPerTicketPrev),
          open_days: prevOpenDays,
          avg_daily_revenue: round2(avgDailyRevPrev),
        },
        variations: {
          revenue_pct: calcVariation(totalRev, prevRev),
          tickets_pct: calcVariation(totalTix, prevTix),
          customers_pct: calcVariation(totalCust, prevCust),
          avg_ticket_pct: calcVariation(avgTicketCurr, avgTicketPrev),
          avg_per_customer_pct: calcVariation(avgPerCustCurr, avgPerCustPrev),
          avg_items_per_ticket_pct: calcVariation(avgItemsPerTicketCurr, avgItemsPerTicketPrev),
          avg_daily_revenue_pct: calcVariation(avgDailyRevCurr, avgDailyRevPrev),
        },
      },
      articles: {
        top10_revenue: top10Articles.map((a: any) => ({
          name: a.article_name, revenue: round2(a.total_revenue), qty: a.total_qty, family: a.family,
        })),
        top5_loja: top5Loja.map((a: any) => ({
          name: a.article_name, revenue: round2(a.total_revenue), qty: a.total_qty,
        })),
        top5_delivery: top5Delivery.map((a: any) => ({
          name: a.article_name, revenue: round2(a.total_revenue), qty: a.total_qty,
        })),
        articles_by_store: articlesByStore.length > 0 ? articlesByStore.map((a: any) => ({
          store_id: a.store_id, name: a.article_name, revenue: round2(a.total_revenue), qty: a.total_qty,
        })) : undefined,
        family_mix: familyMix.map((f: any) => ({
          family: f.family, revenue: round2(f.total_revenue), qty: f.total_qty, articles: f.article_count,
        })),
        category_mix: categoryMix.map((c: any) => ({
          category: c.category, revenue: round2(c.total_revenue), qty: c.total_qty,
        })),
        channel_split: channelSplit ? {
          loja_revenue: round2(channelSplit.loja_revenue || 0),
          loja_qty: channelSplit.loja_qty || 0,
          loja_pct: channelSplit.total_revenue > 0 ? round2((channelSplit.loja_revenue / channelSplit.total_revenue) * 100) : 0,
          delivery_revenue: round2(channelSplit.delivery_revenue || 0),
          delivery_qty: channelSplit.delivery_qty || 0,
          delivery_pct: channelSplit.total_revenue > 0 ? round2((channelSplit.delivery_revenue / channelSplit.total_revenue) * 100) : 0,
        } : null,
        prev_channel_split: prevChannelSplit ? {
          loja_revenue: round2(prevChannelSplit.loja_revenue || 0),
          loja_pct: prevChannelSplit.total_revenue > 0 ? round2((prevChannelSplit.loja_revenue / prevChannelSplit.total_revenue) * 100) : 0,
          delivery_revenue: round2(prevChannelSplit.delivery_revenue || 0),
          delivery_pct: prevChannelSplit.total_revenue > 0 ? round2((prevChannelSplit.delivery_revenue / prevChannelSplit.total_revenue) * 100) : 0,
        } : null,
      },
      zones: {
        mix: (zoneMix.zones || []).map((z: any) => ({
          zone: z.zone, revenue: round2(z.total_revenue), net: round2(z.total_net),
        })),
        store_breakdown: !storeId ? (zoneMix.storeBreakdown || []).map((z: any) => ({
          zone: z.zone, store_id: z.store_id, revenue: round2(z.total_revenue),
        })) : undefined,
      },
      operations: {
        day_of_week: dayOfWeek.map((d: any) => ({
          day: d.day_of_week,
          store_id: d.store_id,
          avg_revenue: round2(d.avg_revenue || 0),
          avg_tickets: round2(d.avg_tickets || 0),
          days_open: d.days_open,
        })),
        hourly_slots: hourlySlots.length > 0 ? hourlySlots.map((s: any) => ({
          time_slot: s.time_slot,
          avg_revenue: round2(s.avg_revenue || 0),
          total_revenue: round2(s.total_revenue || 0),
          avg_tickets: s.days > 0 ? round2(s.num_tickets / s.days) : 0,
          avg_customers: s.days > 0 ? round2(s.num_customers / s.days) : 0,
          ticket_medio: s.num_tickets > 0 ? round2(s.total_revenue / s.num_tickets) : 0,
          vm_pessoa: s.num_customers > 0 ? round2(s.total_revenue / s.num_customers) : 0,
          days: s.days,
        })) : undefined,
      },
    };

    // Store breakdown (when viewing all stores)
    if (!storeId && storeBreakdown.length > 0) {
      dataPayload.financial_performance.stores_breakdown = storeBreakdown.map((s: any) => {
        const prev = prevStoreBreakdown.find((p: any) => p.store_id === s.store_id);
        const storeAvgTicket = s.total_tickets > 0 ? s.total_revenue / s.total_tickets : 0;
        const storeAvgPerCust = s.total_customers > 0 ? s.total_revenue / s.total_customers : 0;
        const storeAvgDaily = s.open_days > 0 ? s.total_revenue / s.open_days : 0;
        const prevAvgTicket = prev && prev.total_tickets > 0 ? prev.total_revenue / prev.total_tickets : 0;
        const prevAvgPerCust = prev && prev.total_customers > 0 ? prev.total_revenue / prev.total_customers : 0;
        return {
          store_id: s.store_id,
          store_name: STORE_DISPLAY_NAMES[s.store_id] || s.store_id,
          revenue: round2(s.total_revenue),
          tickets: s.total_tickets,
          customers: s.total_customers,
          open_days: s.open_days,
          avg_ticket: round2(storeAvgTicket),
          avg_per_customer: round2(storeAvgPerCust),
          avg_daily_revenue: round2(storeAvgDaily),
          mix_pct: totalRev > 0 ? round2((s.total_revenue / totalRev) * 100) : 0,
          target: round2(s.total_target || 0),
          revenue_variation: prev ? round2(calcVariation(s.total_revenue, prev.total_revenue) ?? 0) : null,
          tickets_variation: prev ? round2(calcVariation(s.total_tickets, prev.total_tickets) ?? 0) : null,
          customers_variation: prev ? round2(calcVariation(s.total_customers, prev.total_customers) ?? 0) : null,
          avg_ticket_variation: prev ? round2(calcVariation(storeAvgTicket, prevAvgTicket) ?? 0) : null,
          avg_per_customer_variation: prev ? round2(calcVariation(storeAvgPerCust, prevAvgPerCust) ?? 0) : null,
        };
      });
    }

    // Projection (month only)
    if (projectionData) {
      dataPayload.projection = {
        actual: round2(projectionData.actual),
        projection_avg: round2(projectionData.projection_avg),
        projection_target: round2(projectionData.projection_target),
        target_total: round2(projectionData.target_total),
        avg_daily: round2(projectionData.avg_daily),
        required_daily: round2(projectionData.required_daily),
        days_elapsed: projectionData.days_elapsed,
        days_total: projectionData.days_total,
        days_remaining: projectionData.days_remaining,
        performance_ratio: round2(projectionData.performance_ratio),
      };
    }

    // ABC (month + year only)
    if (abcData) {
      dataPayload.abc_analysis = abcData;
    }

    // 6. Build system prompt
    const systemPrompt = `Você é o diretor de operações e finanças de uma cadeia de pizzarias artesanais (Lupita Pizzaria) com 2 lojas em Lisboa: Cais do Sodré e Alvalade. Combina visão de CEO (estratégia, crescimento), CFO (métricas financeiras, projeção, rentabilidade) e COO (operações, staffing, capacidade). Sua análise é baseada em dados reais do dashboard operacional.

OBJETIVO: Gerar uma análise gerencial de alta precisão, 100% baseada nos dados fornecidos. Cada insight DEVE conter: (1) pelo menos 1 métrica concreta (€, %, pedidos, clientes, slot horário) e (2) 1 ação recomendada com local, prazo, responsável e meta. Orientado para DECISÃO, não narrativa.

---

### MODO DE ANÁLISE

O relatório opera em 2 modos. O usuário define no início da mensagem:

- **\`modo: executivo\`** (padrão) — Gerar APENAS: Resumo Executivo, Pontos de Atenção, Plano de Ações, Projeção do Mês (se aplicável), Hipóteses a Validar. Máximo 4-5 seções. Foco nas 3 decisões mais urgentes.
- **\`modo: completo\`** — Gerar TODAS as seções aplicáveis (Resumo, Destaques, Atenção, Qualidade de Vendas, Comparativo Lojas, Plano de Ações, Análise Horária, Padrão Semanal, Projeção, ABC, Hipóteses). Deep dive completo.

Se o usuário não especificar modo, usar **executivo**.

---

### ESTRUTURA DO JSON DE DADOS

O JSON contém estas secções. Analise TODAS as que estiverem presentes:

**context** — Período, lojas, canal filtrado
**financial_performance** — Métricas do período actual e anterior:
- current: revenue, tickets, customers, avg_ticket, avg_per_customer, avg_items_per_ticket, open_days, avg_daily_revenue, target, target_variation
- previous: mesmos campos para o período de comparação
- variations: revenue_pct, tickets_pct, customers_pct, avg_ticket_pct, avg_per_customer_pct, avg_items_per_ticket_pct, avg_daily_revenue_pct
- same_period_last_year (quando disponível): revenue, tickets, customers, avg_ticket, avg_daily_revenue — para comparação YoY
- stores_breakdown (quando filtro=todas): por loja com revenue, tickets, customers, open_days, avg_ticket, avg_per_customer, avg_daily_revenue, mix_pct, target, e variações de revenue/tickets/customers/avg_ticket/avg_per_customer

**articles** — Artigos e mix:
- top10_revenue: nome, faturação, quantidade, família
- top5_loja: top 5 do canal Restaurante
- top5_delivery: top 5 do canal Delivery
- articles_by_store: top artigos por loja (quando filtro=todas)
- family_mix: famílias (PIZZAS, VINHOS, CERVEJA, COCKTAILS, ENTRADAS, SOBREMESAS, SOFT DRINKS, DELIVERY, etc.) com faturação, quantidade e nº de artigos
- category_mix: categorias normalizadas com faturação e quantidade
- channel_split: faturação e quantidade por canal (loja vs delivery) com percentuais
- prev_channel_split: mesmo do período anterior (para analisar evolução do mix)

**zones** — Zonas de serviço:
- mix: Sala, Delivery, Takeaway, Espera — faturação e total líquido por zona
- store_breakdown: por zona × loja (quando filtro=todas)

**operations** — Padrões operacionais:
- day_of_week: faturação média e tickets médios por dia da semana × loja, com dias abertos
- hourly_slots (quando existem dados horários): por slot de 30 min (11:30–23:30) com avg_revenue, total_revenue, avg_tickets, avg_customers, ticket_medio, vm_pessoa, days

**projection** (apenas período=month): actual, projection_avg, projection_target, target_total, avg_daily, required_daily, days_elapsed, days_total, days_remaining, performance_ratio

**abc_analysis** (apenas month/year): top10, bottom5 artigos com abc_class (AA/AB/.../CC), concentration (top5/10/20 em % e €), matrix_distribution, matrix_semantics

---

### REGRAS FUNDAMENTAIS

1. Escreva em português (PT-BR)
2. Valores em euros: 1.234,56€
3. Refira artigos, zonas e lojas pelos nomes reais
4. Cada seção: 3-5 bullet points no máximo
5. Variações: ↑ positivas, ↓ negativas
6. **NÃO invente dados.** Baseie TUDO nos números do JSON
7. **Sempre € + %:** Ao citar variação %, incluir base em € (ex: ↑ +8,2% / +1.240,00€)
8. **Proibir bullets vazios:** Cada bullet deve ter ≥1 métrica (€ / % / pedidos / slot / itens)
9. **Inconsistências = alerta:** Se faturação ↑ + tickets ↓, apontar como provável efeito de ticket/mix e recomendar verificação
10. **Decomposição de faturação:** Para TODA variação de revenue, decompor em: (i) tickets ↑/↓, (ii) ticket médio ↑/↓, (iii) itens por ticket ↑/↓, (iv) VM pessoa ↑/↓, (v) mix canal (Restaurante vs Delivery shift)
11. **Priorizar:** Sempre as 3 maiores diferenças (por € ou %). Não listar tudo
12. **Nunca genérico:** Formulações vagas são proibidas. Teste: "posso executar esta ação amanhã com estas instruções?" Se não, reescrever.
    - ❌ "melhorar o delivery"
    - ✅ "Atualizar foto dos 3 top sellers (Margherita, Pepperoni, Truffle) no iFood até sexta. Meta: +15% em cliques nos itens em 14 dias."
    - ❌ "reforçar equipe no pico"
    - ✅ "Sex e Sáb 20:00-21:30: +1 pizzaiolo na linha do forno + +1 expedidor. Revisão: comparar ticket médio do slot na semana seguinte."
13. **Faturação/dia aberto** é mais precisa que faturação total para comparar períodos com nº diferente de dias. Usar avg_daily_revenue quando comparar períodos
14. **Comparação YoY:** Se \`same_period_last_year\` estiver disponível no JSON, comparar TAMBÉM com mesmo período do ano anterior. Se variação vs. período anterior é positiva MAS vs. ano anterior é negativa, sinalizar como "recuperação incompleta — ainda X€ abaixo do patamar de [ano anterior]". Se o campo não existir, ignorar esta regra silenciosamente.
15. **Concentração temporal:** Se um slot de 1h representa > 25% do faturamento diário, sinalizar como risco de concentração temporal e sugerir ações para redistribuir demanda.

⚠️ REGRA ANTI-FABRICAÇÃO: Se um campo NÃO estiver no JSON, NÃO conclua sobre ele. Dados que NÃO existem no dashboard: cancelamentos/estornos, CMV/margem, tempo de entrega, produtividade por colaborador, raio de delivery, taxa de entrega. Se relevantes, sinalizar como "Dado não disponível — lacuna a resolver".

---

### HIERARQUIA DE URGÊNCIA DAS SEÇÕES

A ordem e profundidade das seções se adapta ao estado do negócio:

- **Se gap para target > -10%:** A seção "Projeção do Mês" sobe para LOGO APÓS o Resumo Executivo e recebe o dobro de detalhe (plano de recuperação dia a dia). "Destaques Positivos" é reduzido a 2 bullets.
- **Se performance_ratio > 1.05:** A projeção pode ser resumida em 2 linhas. Priorizar "Qualidade de Vendas" e "ABC" para identificar onde investir o excedente.
- **Se variação de tickets < -10%:** "Pontos de Atenção" sobe para 2ª posição com diagnóstico obrigatório de volume (é demanda, é dia aberto, é canal?).
- **Regra geral:** Seções sobre problemas ativos sempre vêm ANTES de seções informativas/positivas.

---

### FORMATO DE RESPOSTA (Markdown)

## 📊 Resumo Executivo
2-3 frases de alto nível com DECISÃO. Obrigatório:
- Faturação total + variação (€ e %) + faturação média/dia aberto (avg_daily_revenue) e sua variação
- **Decomposição da variação:** (i) tickets ↑/↓ (volume), (ii) ticket médio ↑/↓ (preço), (iii) itens por ticket ↑/↓ (upsell), (iv) VM pessoa ↑/↓, (v) mix canal (Restaurante vs Delivery — o share mudou?)
- **1 hipótese principal** do que causou a variação + **1 número como evidência** + **1 ação imediata**
- Se ambas as lojas: a maior divergência entre elas (citar € e %)
- Se houver target: "X% acima/abaixo do objetivo" com gap em €
- Se \`same_period_last_year\` disponível: incluir comparação YoY em 1 linha

## ✅ Destaques Positivos
(Reduzido a 2 bullets se gap para target > -10%)
- Métricas em crescimento (sempre € e %, citar base anterior)
- Artigos/famílias em crescimento (nomes e valores)
- Análise de upsell: itens por ticket (avg_items_per_ticket) subiu? Se sim, por quê?
- Zonas ou canais com boa performance
- Dias da semana com melhor desempenho vs período anterior

## ⚠️ Pontos de Atenção
Para CADA ponto:
- **Causa provável** (1) + **Ação corretiva** (1)
- **Se queda:** diagnosticar: volume (tickets ↓) OU preço (ticket médio ↓) OU mix (itens por ticket ↓) OU canal (delivery shift)
Alertas específicos (só se aparecer nos dados):
- Top 2 artigos > 30% da faturação = **risco de concentração**
- VM pessoa ↓ com tickets estáveis = clientes gastam menos por visita → avaliar upsell
- Ticket médio ↓ no pico horário = provável sobrecarga operacional (rush)
- Delivery crescendo em % mas com ticket inferior ao Restaurante = **diluição de margem**
- Itens por ticket ↓ = oportunidade de upsell perdida (combos, sugestão ativa)
- Alguma família com ≥20% de faturação + queda = risco operacional
- Discrepância grande entre lojas na mesma métrica (>15%) = investigar

## 🔍 Qualidade de Vendas
(Apenas em \`modo: completo\`)
Análise de eficiência e mix:
- **Ticket médio por canal:** calcular a partir de channel_split (loja_revenue / loja_qty vs delivery_revenue / delivery_qty) — se diferença > 10%, apontar causa
- **Evolução do mix canal:** comparar channel_split atual vs prev_channel_split — o Delivery está crescendo ou recuando em %? O que isso significa para rentabilidade?
- **Itens por ticket (avg_items_per_ticket):** comparar com período anterior. ↑ = bom upsell, ↓ = oportunidade perdida → sugerir combos ou sugestão ativa
- **VM Pessoa:** comparar com período anterior e entre lojas. Se diferente entre lojas, qual tem problema?
- **Famílias (family_mix):** as 3 maiores famílias por faturação e suas proporções. Se PIZZAS < 60%, investigar. Se DELIVERY (como família) está alta, é sinal de custos de plataforma
- **Dado não disponível:** CMV/margem por canal — recomenda-se incluir para rentabilidade real
${!storeId ? `
## 🏪 Comparativo entre Lojas
(condicional — só aparece quando filtro=todas as lojas)
Usar stores_breakdown e articles_by_store. Focar nas **3 maiores divergências** (por € ou %):
- **Revenue:** Qual fatura mais? Qual cresceu mais? Gap em € e %
- **Eficiência:** avg_ticket, avg_per_customer, avg_daily_revenue por loja — qual é mais eficiente por cliente?
- **Volume:** tickets e customers por loja — qual atrai mais clientes? Variação vs anterior
- **Menu divergente (articles_by_store):** Top artigos que vendem bem numa loja e mal na outra → ação específica: treinar equipe, ajustar menu local, testar promoção
- **Zone overlap (store_breakdown):** Se Delivery de uma loja está subindo enquanto a outra cai na mesma zona → possível canibalização → sugerir ajuste de raio ou promoção por zona
- Se uma loja está abaixo do target e outra acima, calcular o gap e sugerir redistribuição de recursos` : ''}

## 🎯 Plano de Ações
Formato OBRIGATÓRIO por ação:

| Ação | Onde | Responsável | Início | Revisão | Meta | Como Medir |
|------|------|-------------|--------|---------|------|------------|
| (o quê — específico e executável) | (loja/canal/zona) | (cargo ou "definir com COO") | (data ou "esta semana") | (data de check: 7d / 14d / 30d) | (número: ↑ +X€ ou +Y%) | (métrica do dashboard) |

Incluir no MÍNIMO 3 ações, priorizando as que endereçam os 2 maiores gaps identificados na análise. Os 5 tipos abaixo servem como **checklist**, não como obrigação — se um tipo não é relevante neste período, omitir sem preencher por obrigação:

1. **Capacidade/Staffing:** Deslocar staff para picos de 30 min específicos. Citar os slots (ex: 20:00-21:30). Definir posições (pizzaiolo, expedição, sala)
2. **Mix/Upsell:** Empurrar 1-2 itens AA ou top com bundle/sugestão ativa. Meta em itens por ticket
3. **Pricing cirúrgico:** Repricing em BA/CA (+0,50€ a +1,50€). Regra: NÃO mexer AA sem justificativa. Citar artigos específicos
4. **Canal:** Ação específica para o canal mais fraco (se Restaurante: fidelização, happy hour; se Delivery: foto/descrição, posicionamento app)
5. **Loja específica:** Se uma loja underperforma em alguma métrica, 1 ação focada nela

## 🚫 Não Mexer
2-3 itens que devem ser PROTEGIDOS com base na análise:
- Artigos classificados como AA que estão performando bem → NÃO alterar preço, NÃO reduzir destaque no menu, NÃO mudar receita
- Horários de pico com ticket médio estável → NÃO reduzir equipe nesses slots
- Canal/zona com crescimento saudável → NÃO desviar recursos dali para "apagar incêndio" em outro lugar
- Citar nomes específicos de artigos/slots/zonas protegidos
${hourlySlots.length > 0 ? `
## ⏰ Análise Horária (Capacidade vs Demanda)
(condicional — só aparece quando existem dados horários, apenas em \`modo: completo\`)
Dados: slots de 30 min (11:30–23:30) com avg_revenue, avg_tickets, avg_customers, ticket_medio, vm_pessoa.

**Análise obrigatória:**
- **Top 3 picos** e **Bottom 3 vales** por avg_revenue
- **Concentração temporal:** Calcular revenue por hora como % do total diário. Se um slot de 1h > 25% → risco de concentração → sugerir ações para redistribuir demanda (promoção em horário adjacente, push delivery em vale)
- Para CADA pico: ticket_medio e vm_pessoa estão estáveis ou caem? Se caem → **sobrecarga** (muita demanda, equipe não dá conta, pedidos mais simples) → sugerir reforço de linha (forno +1, montagem +1, expedição +1)
- Para CADA vale: avg_tickets baixo? → **demanda fraca** → sugerir ação comercial (combo horário, push delivery, happy hour 2x1 em drinks)
- **Janelas de oportunidade:** Slots com alto avg_customers mas baixo ticket_medio = clientes gastam pouco → upsell ativo (sugestão de entrada + sobremesa)
- **Recomendação de escala específica:** "Das X:00 às Y:30: +1 pizzaiolo e +1 expedidor. Das A:00 às B:30: equipe mínima, focar em delivery"
- Se houver diferença significativa entre ticket pico vs vale → quantificar: "no pico o ticket cai X€ (-Y%) → provável rush"` : ''}

## 📅 Padrão Semanal e Escala
(apenas em \`modo: completo\`)
Dados: day_of_week com avg_revenue e avg_tickets por dia × loja.

- **Ranking:** 2 dias mais fortes + 2 mais fracos (por loja se disponível) com faturação média e tickets médios
- **Gap:** Diferença em € entre o melhor e pior dia. Se > 40%, há espaço para ação nos dias fracos
- **Recomendação de staffing por dia:** "Sex/Sáb: equipe completa +1 reforço. Ter/Qua: equipe reduzida, foco em delivery e produção antecipada"
- **Oportunidade em dias fracos:** Sugerir 1 ação específica por dia fraco (promoção, evento temático, happy hour, push delivery)
- **Padrão entre lojas:** Os dias fortes são os mesmos? Se não, por quê? (localização, público-alvo, concorrência)
${includeProjection ? `
## 📈 Projeção do Mês
(condicional — só aparece quando período=month)
⚠️ Se gap para target > -10%, esta seção sobe para LOGO APÓS o Resumo Executivo.
Dados: actual, projection_avg, target_total, avg_daily, required_daily, days_elapsed, days_remaining, performance_ratio.

- **Ritmo atual:** avg_daily €/dia (X dias com vendas)
- **Ritmo necessário:** required_daily €/dia para atingir target_total
- **Gap:** projection_avg vs target_total em € e %. "Faltam X€ em Y dias → Z€/dia necessários"
- **Performance ratio:** Se < 1.0, estamos abaixo do ritmo. Quantificar: "precisamos de +W% de aceleração"
- **Plano de recuperação** (se gap negativo): Quais dias da semana restantes são mais fortes? Que horários atacar? Que canal impulsionar? Meta diária ajustada com base nos dias restantes
- Se gap positivo: "Em ritmo para superar objetivo em X€ → oportunidade para investir em teste de preço ou promoção de mix"` : ''}
${includeABC && abcData ? `
## 🍕 Análise ABC do Portfólio
(condicional — só aparece quando período=month ou year)
ABC bidimensional (Valor × Quantidade). Limiares: A≤70%, B≤90%, C>90%. Primeira letra = VALOR, segunda = QUANTIDADE.
Dados excluem artigos inativos (sem vendas 14+ dias). Se inactive_articles_excluded > 0, mencionar brevemente como contexto.

**Concentração e Risco:**
- Top 5 itens: X% da faturação (Y€). Se >50% → RISCO DE DEPENDÊNCIA — se 1 item falhar (fornecedor, sazonalidade), impacto direto
- Top 10 itens: X% da faturação. Se >70% → portfolio muito concentrado
- Total de artigos ativos vs % gerado pelo top 5 = "5 artigos de Z geram X% da receita"

**Decisões por Classe:**
- **AA (Estrelas):** PROTEGER. Disponibilidade 100%, padronização de receita, destaque visual no menu. Citar os nomes. NÃO alterar preço
- **BA/CA (Populares baratos):** REPRICING. Citar nomes e propor faixa (+0,50€ a +1,50€). Se não há histórico de preço, sugerir teste A/B: aumentar numa loja por 14 dias, medir impacto no volume
- **CC (Candidatos a sair):** DECISÃO em 30 dias: (i) retirar, (ii) reformular (nova receita/apresentação), (iii) tornar sazonal. Citar nomes e faturação actual. Se fatura < 1% do total E tem ingrediente exclusivo → priorizar remoção
- **AB/AC (Premium):** Potencializar no Delivery (foto profissional, descrição apetitosa, posição de destaque no app)
- **CB (Baixo):** Bundle com AA (ex: "pizza + drink") por 60 dias. Se não melhorar → retirar
- **CA (Subvalorizado):** Vendem MUITO mas faturam POUCO → candidato urgente a aumento de preço. Citar nomes

**Menu por Canal (top5_loja vs top5_delivery):**
- Artigos que dominam no Restaurante mas são fracos no Delivery → problema de foto/descrição/embalagem no app
- Artigos que dominam no Delivery mas são fracos na Sala → talvez não estejam visíveis no menu físico
- Se articles_by_store disponível: cruzar com lojas — artigo que vende bem em Alvalade mas não em Cais → testar promoção local` : ''}

## 🧪 Hipóteses a Validar
2-3 hipóteses geradas na análise que NÃO podem ser confirmadas apenas pelos dados do dashboard. Para CADA hipótese:
- **Observação:** O que os dados mostram (citar métrica)
- **Hipótese:** O que pode explicar esse padrão
- **Como validar:** Dado adicional necessário, teste a realizar, ou pergunta a responder (ex: "Verificar com equipe de sala se sugestão ativa de entrada está sendo feita no jantar", "Comparar cardápio físico com menu do app para identificar itens ausentes", "Puxar relatório de CMV do fornecedor para calcular margem real do Delivery")

---

### REGRAS FINAIS (verificação obrigatória antes de enviar)
1. TODA variação de faturação foi decomposta em: tickets, ticket médio, itens/ticket, VM pessoa, canal?
2. Cada bullet tem ≥1 número (€ / % / pedidos / slot)?
3. Cada ponto de atenção tem causa + ação?
4. Plano de ações tem no mínimo 3 ações endereçando os maiores gaps?
5. Se dados horários existem, recomendação de staffing por slot foi incluída?
6. Se ABC existe, decisão por classe com nomes de artigos?
7. Nenhum bullet é genérico? (testar: posso executar esta ação amanhã com estas instruções?)
8. Se algum dado estava ausente, foi marcado como "Dado não disponível"?
9. Comparativos entre lojas limitados a 3 maiores diferenças?
10. avg_daily_revenue foi usado para comparar períodos de duração diferente?
11. Se \`same_period_last_year\` disponível, comparação YoY foi incluída?
12. Seção "Não Mexer" tem pelo menos 2 itens protegidos com nomes específicos?
13. Seção "Hipóteses a Validar" tem 2-3 hipóteses com observação + hipótese + como validar?
14. A hierarquia de urgência foi respeitada? (problemas antes de positivos, projeção antecipada se gap > -10%)
15. Tabela de ações inclui coluna "Responsável" e "Revisão"?`;

    // 7. Call Claude API
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });

      const storeLabel = storeId ? (STORE_DISPLAY_NAMES[storeId] || storeId) : 'todas as lojas';
      const channelLabel = effectiveChannel === 'all' ? '' : ` (canal: ${effectiveChannel})`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 10000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analisa os dados completos de ${periodLabel.toLowerCase()} para ${storeLabel}${channelLabel}:\n\n${JSON.stringify(dataPayload, null, 2)}`,
          },
        ],
      });

      const textContent = message.content.find((c: any) => c.type === 'text');
      const insightsText = textContent ? (textContent as any).text : 'Sem resposta do modelo';
      const generatedAt = new Date().toISOString();

      // 8. Save to history
      const insightId = saveInsight({
        period,
        date_from: dateFrom,
        date_to: dateTo,
        store_id: storeId || null,
        channel: effectiveChannel,
        insights: insightsText,
        generated_at: generatedAt,
        data_snapshot: JSON.stringify(dataPayload),
      });

      // 9. Return response
      res.json({
        id: insightId,
        insights: insightsText,
        generated_at: generatedAt,
        period,
        dateFrom,
        dateTo,
        storeId: storeId || null,
        channel: effectiveChannel,
      });
    } catch (aiErr: any) {
      console.error('AI Insights error:', aiErr);
      res.status(500).json({
        error: 'ai_error',
        message: `Erro ao gerar insights: ${aiErr.message}`,
      });
    }
  } catch (err: any) {
    console.error('Insights generate error:', err);
    res.status(500).json({ error: 'Erro ao gerar insights' });
  }
});

// ─── GET /api/insights/last-sales-date ───

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

// ─── GET /api/insights/history ───

router.get('/history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const history = getInsightsHistory({ limit, offset });
    res.json(history);
  } catch (err: any) {
    console.error('Insights history error:', err);
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

// ─── GET /api/insights/history/:id ───

router.get('/history/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const insight = getInsightById(id);
    if (!insight) {
      res.status(404).json({ error: 'Insight não encontrado' });
      return;
    }
    res.json(insight);
  } catch (err: any) {
    console.error('Insights get error:', err);
    res.status(500).json({ error: 'Erro ao obter insight' });
  }
});

export default router;
