# Lupita Dashboard - Instrucoes para o Claude

## Regra Obrigatoria: Revisao do Prompt Insights AI

**SEMPRE** que qualquer alteracao for feita na aplicacao (backend ou frontend), o Claude deve:

1. **Silenciosamente** revisar o ficheiro `server/routes/insights.ts` para verificar se o prompt do Insights AI precisa de atualizacao
2. Verificar se:
   - Novos dados/metricas foram adicionados que devem ser incluidos no `dataPayload`
   - Novas seccoes ou funcionalidades do dashboard que devem gerar insights
   - Mudancas em nomes de campos, zonas, lojas ou categorias que afetam o prompt
   - Novas queries em `server/db/queries.ts` que poderiam enriquecer os insights
   - Alteracoes na estrutura de dados que afetam como os dados sao passados ao modelo
3. Se necessario, atualizar: imports, recolha de dados, `dataPayload`, `systemPrompt`
4. **Nao comunicar ao utilizador** - fazer a revisao e atualizacao silenciosamente
5. O modelo usado e `claude-opus-4-20250514` e o idioma e **PT-BR**

## Regra Obrigatoria: Deploy Workflow

**SEMPRE** apos fazer alteracoes, o Claude deve:
1. Fazer bump de versao: `bash bump.sh`
2. Build: `cd client && npx vite build`
3. Commit + push: `git add . && git commit -m "msg" && git push origin main`
4. Railway faz auto-deploy via Dockerfile

## Dono e Contexto

- **Dono:** Duda (Lupita Pizzaria, Lisboa)
- **Lojas:** Cais do Sodre, Alvalade
- **Idioma UI:** Portugues (PT-PT)
- **Idioma Insights AI:** Portugues (PT-BR)
- **Moeda:** EUR, formato `1.234,56 EUR`
- **Repo:** `github.com/duda-web/lupita-dashboard` (branch: `main`)
- **Deploy:** Railway (auto-deploy on push via Dockerfile)

## Stack Tecnica

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts + Framer Motion + Radix UI
- **Backend:** Express.js + SQLite (better-sqlite3) + TypeScript
- **AI:** Anthropic Claude API (`claude-opus-4-20250514`)
- **Auth:** JWT (7 dias) + bcrypt
- **Icons:** Lucide React
- **Toasts:** Sonner
- **Sync:** ZSBMS (sistema externo de gestao de restaurantes)

## Portas e Ambiente

- Backend: `localhost:3001`
- Frontend dev: `localhost:5173` (Vite com HMR, proxy para 3001)
- PATH: `export PATH="/Users/dudaferreira/local/node/bin:/usr/bin:/bin:$PATH"`
- Node: `/Users/dudaferreira/local/node/bin`
- DB: `./lupita.db` (raiz do projeto, resolvido via `path.resolve(__dirname, '../../', DB_PATH)`)

## Scripts Importantes

```bash
# Bump versao (formato: v.YYYYMMDD-X, incrementa por dia)
bash bump.sh

# Build frontend
cd client && npx vite build

# Dev mode (ambos servidores)
npm run dev

# Dev server com watch
npx tsx watch server/server.ts

# Seed DB (criar users iniciais)
npm run seed

# Auto-import XLSX
npm run auto-import
```

## launch.json (Claude Code Dev Servers)

Configurado em `.claude/launch.json`:
- `backend`: `npx tsx watch server/server.ts` na porta 3001
- `frontend`: `npx vite` na porta 5173 (cwd: client)

## Versao

- **Ficheiro:** `client/src/lib/version.ts`
- **Script:** `bash bump.sh` (auto-bump com formato `v.YYYYMMDD-X`)
- **Formato antigo:** `v1.X` (usado ate v1.41)
- **Formato novo:** `v.YYYYMMDD-X` (X incrementa por dia, reseta a 1 no dia seguinte)

## Estrutura do Projeto

```
lupita-dashboard/
+-- client/
|   +-- src/
|   |   +-- pages/           9 paginas (Login, Dashboard, Hourly, Artigos, ABC, Insights, Upload, Instrucoes, Sync)
|   |   +-- components/
|   |   |   +-- dashboard/   Layout, Filters, KPICard, StoreCard, Charts...
|   |   |   +-- artigos/     TopArticles, StoreComparison, ChannelSplit, CategoryMix
|   |   |   +-- abc/         ABCKPIs, ABCRanking, ABCPareto, ABCDistribution, ABCEvolution, ABCStoreComparison
|   |   |   +-- insights/    InsightsPanel, InsightsHistory
|   |   |   +-- auth/        LoginForm, ProtectedLayout
|   |   |   +-- ui/          Radix UI wrappers (date-picker, dropdown, dialog, etc.)
|   |   +-- context/         AuthContext, FilterContext
|   |   +-- hooks/           useNewTags
|   |   +-- lib/             api.ts, constants.ts, dateUtils.ts, formatters.ts, version.ts
|   |   +-- types/           index.ts (todas as interfaces)
|   |   +-- App.tsx          Rotas
|   |   +-- main.tsx
|   +-- vite.config.ts       Proxy /api -> localhost:3001, alias @/ -> src/
|   +-- tailwind.config.js
|   +-- package.json
+-- server/
|   +-- routes/              auth, kpis, charts, abc, articles, hourly, export, upload, insights, newTags, sync, reports
|   +-- services/            salesParser, zoneParser, hourlyParser, importService, metricsService, syncService, cronService, encryption
|   +-- db/
|   |   +-- queries.ts       Todas as queries + migrations auto-run
|   |   +-- schema.sql       Schema das tabelas
|   |   +-- pageUpdates.ts   NEW tags registry (PAGE_UPDATES array)
|   +-- middleware/           auth, adminOnly
|   +-- server.ts            Express setup + static serve
|   +-- env.ts
+-- scripts/                 seed.ts, auto-import.ts
+-- bump.sh                  Auto-bump versao
+-- Dockerfile               Multi-stage build (Node 22 Alpine)
+-- package.json
+-- .env.example
```

## Rotas da App (Frontend)

| Path | Pagina | Icone |
|------|--------|-------|
| `/login` | LoginPage | - |
| `/dashboard` | DashboardPage | LayoutDashboard |
| `/hourly` | HourlyPage (Faturacao / Horario) | Clock |
| `/artigos` | ArtigosPage | ShoppingBag |
| `/abc` | ABCPage (Analise ABC) | BarChart3 |
| `/insights` | InsightsPage (Insights AI) | Sparkles |
| `/upload` | UploadPage | Upload |
| `/instrucoes` | InstrucoesPage (Informacoes) | BookOpen |
| `/sync` | SyncPage (Sincronizacao) | RefreshCw (admin only) |

## API Endpoints

**Auth:** `POST /api/auth/login`, `GET /api/auth/me`
**KPIs:** `/api/kpis`, `/api/kpis/last-sales-date`, `/api/kpis/mtd`, `/api/kpis/ytd`, `/api/kpis/projection`
**Charts:** `/api/charts/{type}` (weekly-revenue, weekly-ticket, day-of-week, monthly, store-mix, target, customers, heatmap, zone-mix, zone-trend)
**ABC:** `/api/abc/date-range`, `/api/abc/ranking`, `/api/abc/distribution`, `/api/abc/evolution`
**Articles:** `/api/articles/top`, `/api/articles/store-comparison`, `/api/articles/channel-split`, `/api/articles/category-mix`
**Hourly:** `/api/hourly/revenue`, `/api/hourly/heatmap`, `/api/hourly/detail`
**Insights:** `POST /api/insights/generate`, `GET /api/insights/history`
**Upload:** `POST /api/upload/import`, `GET /api/upload/history`
**Export:** `GET /api/export/daily`, `GET /api/export/csv`
**NEW Tags:** `GET /api/new-tags`, `POST /api/new-tags/mark-seen`
**Sync:** `POST /api/sync/trigger`, `GET /api/sync/status/:id`, `GET/POST /api/sync/settings`, `GET /api/sync/logs`
**Reports:** `GET /api/reports`

## Base de Dados (SQLite)

**Tabelas principais:**
- `daily_sales` - Faturacao diaria (store_id, date, revenue, tickets, customers, avg_ticket)
- `zone_sales` - Vendas por zona (Sala, Delivery, Takeaway, Espera, Eventos, Outros)
- `article_sales` - Vendas por artigo por periodo
- `abc_daily` - Classificacao ABC por artigo/dia (com is_excluded, exclude_reason)
- `hourly_sales` - Vendas por slot de 30 min (11:30-23:30) por zona
- `insights_history` - Historico de insights AI com snapshots
- `users` - Utilizadores (username, password_hash bcrypt, role: admin/viewer)
- `import_log` - Historico de imports (import_type: financial/other)
- `page_updates` - Registry de paginas com NEW badge
- `user_page_views` - Tracking de visitas (para remover NEW badge)
- `sync_settings` - Credenciais ZSBMS (password encriptada)
- `sync_log` - Historico de sincronizacoes
- `stores` - Metadata das lojas (display_name, raw_name, open_days, opened_date)

**Pragmas:** WAL mode, foreign keys enabled
**Migrations:** Auto-run no startup via `initializeDatabase()`

## Autenticacao

- **Login:** `POST /api/auth/login` com `{ username, password }` -> JWT token
- **Token:** localStorage `lupita_token`, header `Authorization: Bearer {token}`
- **Expiry:** 7 dias
- **Roles:** `admin` (acesso total), `viewer` (sem sync/settings)
- **Users atuais na DB:** `duda` (admin), `abud` (viewer)
- **Password atual:** `lupita2024` (para ambos, reset em 24 Fev 2026)

## Convencoes UI

- **Header padrao:** `<div className="flex items-center gap-3 mb-2">` + `Icon h-5 w-5 text-lupita-amber` + `h1 text-xl font-bold`
- **Filtros:** Componente `<Filters>` com `children` (inline) e `bottomChildren` (row 2), prop `hideComparison`
- **Channel filter agrupado:** `rounded-lg border border-border bg-card p-1` com botoes `rounded-md`, icones `h-3.5 w-3.5` (LayoutGrid, Store, Truck)
- **Quick filter pills:** `rounded-full` com `bg-lupita-amber text-white` quando ativo
- **Icons em charts:** `h-4 w-4 text-lupita-amber`
- **Icons em cards:** `h-3.5 w-3.5`
- **Spacing:** `gap-4` e `space-y-4` consistente
- **Sidebar:** `w-60` (240px)
- **Import aliasing:** `PieChart as PieChartIcon`, `AreaChart as AreaChartIcon`
- **Layout padding:** `px-4 md:px-6 lg:px-8 pt-2 pb-4 md:pb-6 lg:pb-8`
- **Theme:** Dark by default, toggle Sun/Moon

## Constantes Importantes (`client/src/lib/constants.ts`)

- **Lojas:** `cais_do_sodre` (amber #f59e0b), `alvalade` (green #10b981), `total` (purple #8b5cf6)
- **Zonas:** Delivery, Sala, Takeaway, Espera, Eventos, Outros (cada com cor propria)
- **Familias de artigos:** 40+ categorias com cores (PIZZAS, VINHOS, CERVEJA, COCKTAILS, etc.)
- **Comparacoes:** WoW (week-over-week), MoM (month-over-month), YoY (year-over-year)
- **Quick filters:** Semana passada, Este mes, Mes passado, Este ano, Ano passado

## NEW Tags System

1. Definir updates em `server/db/pageUpdates.ts` -> `PAGE_UPDATES` array
2. Server sync no startup: upsert para tabela `page_updates`
3. Client: `useNewTags()` hook busca `/api/new-tags`
4. Auto mark como visto quando user navega para a pagina
5. Array vazio = sem tags

## ZSBMS Sync

- 5 relatorios: Vendas Completo, Zonas, Artigos, ABC, Horario
- Registry em `server/services/reportRegistry.ts`
- Credenciais encriptadas em `sync_settings`
- Sync async com polling de status
- Previne execucoes concorrentes

## Insights AI (InsightsPage)

- Usa estado local (nao FilterContext global)
- Periodos: `week | month | last_month | year | last_year | custom`
- Canal: `all | loja | delivery`
- Date pickers sempre visiveis
- Period pills auto-calculam datas
- Historico + Gerar Insights agrupados com `ml-auto`

## Ficheiros Chave por Camada

| Camada | Ficheiros |
|--------|-----------|
| DB schema | `server/db/schema.sql` |
| DB queries + migrations | `server/db/queries.ts` |
| Parsers XLSX | `server/services/salesParser.ts`, `zoneParser.ts`, `hourlyParser.ts` |
| Import pipeline | `server/services/importService.ts` |
| Metricas | `server/services/metricsService.ts` |
| Sync ZSBMS | `server/services/syncService.ts` |
| Insights AI prompt | `server/routes/insights.ts` |
| Tipos globais | `client/src/types/index.ts` |
| API client | `client/src/lib/api.ts` |
| Constantes | `client/src/lib/constants.ts` |
| Versao | `client/src/lib/version.ts` |
| Formatters | `client/src/lib/formatters.ts` |
| Date utils | `client/src/lib/dateUtils.ts` |

## Docker / Railway

- Multi-stage: Node 22 Alpine
- Build client no container
- Serve `client/dist/` como static via Express
- DB montado como volume: `/app/lupita.db`
- Porta: 3001
- Entry: `npx tsx server/server.ts`
