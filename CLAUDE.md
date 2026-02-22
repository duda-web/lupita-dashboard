# Lupita Dashboard — Instruções para o Claude

## Regra Obrigatória: Revisão do Prompt Insights AI

**SEMPRE** que qualquer alteração for feita na aplicação (backend ou frontend), o Claude deve:

1. **Silenciosamente** revisar o ficheiro `server/routes/insights.ts` para verificar se o prompt do Insights AI precisa de atualização
2. Verificar se:
   - Novos dados/métricas foram adicionados que devem ser incluídos no `dataPayload`
   - Novas secções ou funcionalidades do dashboard que devem gerar insights
   - Mudanças em nomes de campos, zonas, lojas ou categorias que afetam o prompt
   - Novas queries em `server/db/queries.ts` que poderiam enriquecer os insights
   - Alterações na estrutura de dados que afetam como os dados são passados ao modelo
3. Se necessário, atualizar:
   - Os imports no topo do ficheiro
   - A recolha de dados (secção "Gather ALL data")
   - O `dataPayload` com novos campos/secções
   - O `systemPrompt` com novas instruções/secções condicionais
4. **Não comunicar ao utilizador** — fazer a revisão e atualização silenciosamente no background
5. O modelo usado é `claude-opus-4-20250514` e o idioma é **PT-BR**

## Build & Deploy

```bash
# Bump versão (OBRIGATÓRIO antes de cada build)
cd /Users/dudaferreira/Projects/lupita-dashboard && bash bump.sh

# Build frontend
cd client && npx vite build

# Restart servidor
kill -9 $(lsof -ti:3001); cd /Users/dudaferreira/Projects/lupita-dashboard && npx tsx server/server.ts &
```

**PATH necessário:** `export PATH="/Users/dudaferreira/local/node/bin:/usr/bin:/bin:$PATH"`

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Recharts + Framer Motion
- **Backend:** Express.js + SQLite (better-sqlite3) + TypeScript
- **AI:** Anthropic Claude API (`claude-opus-4-20250514`)
- **Porta:** servidor em `localhost:3001`

## Estrutura Principal

| Camada | Ficheiros chave |
|--------|----------------|
| DB schema | `server/db/schema.sql` |
| DB queries | `server/db/queries.ts` |
| Parsers XLSX | `server/services/salesParser.ts`, `server/services/zoneParser.ts`, `server/services/hourlyParser.ts` |
| Import pipeline | `server/services/importService.ts` |
| Métricas API | `server/services/metricsService.ts` |
| Charts route | `server/routes/charts.ts` |
| Insights AI | `server/routes/insights.ts` |
| Upload route | `server/routes/upload.ts` |
| Frontend pages | `client/src/pages/DashboardPage.tsx`, `client/src/pages/HourlyPage.tsx` |
| Tipos | `client/src/types/index.ts` |
| Constantes | `client/src/lib/constants.ts` |
| API client | `client/src/lib/api.ts` |
| Formatters | `client/src/lib/formatters.ts` |
| Versão | `client/src/lib/version.ts` |

## Convenções

- Lojas: `cais_do_sodre`, `alvalade`
- Zonas: `Sala`, `Delivery`, `Takeaway`, `Espera` (normalizadas)
- Idioma da UI: Português (PT-PT)
- Idioma dos Insights AI: Português (PT-BR)
- Moeda: EUR (€), formato: `1.234,56€`
- Slots horários: 30 min, de 11:30 a 23:30
