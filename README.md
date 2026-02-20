# Lupita Dashboard

Dashboard financeiro semanal para Lupita Pizzaria (Lisboa, Portugal).

## Requisitos

- Node.js 20+ (recomendado: 22 LTS)
- npm 10+

## Setup

```bash
# Instalar dependências
npm install
cd client && npm install && cd ..

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com um JWT_SECRET seguro

# Criar base de dados e utilizadores
npm run seed
```

## Credenciais iniciais

| Utilizador | Password     | Role   |
|-----------|-------------|--------|
| duda      | lupita2026  | admin  |
| abud      | lupita2026  | viewer |

**Alterar as passwords após o primeiro login.**

## Arranque

```bash
# Desenvolvimento (server + client em paralelo)
npm run dev

# Ou separadamente:
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

Abrir http://localhost:5173 no browser.

## Import de dados

### Via interface web
1. Fazer login no dashboard
2. Ir a Upload
3. Arrastar ficheiros .xlsx (Apuramento Completo do ZSBMS-PRO)
4. Confirmar import

### Via script automático
```bash
# Colocar ficheiros .xlsx em data/inbox/
npm run auto-import
```

Os ficheiros processados são movidos para `data/processed/YYYY-MM/`.
Ficheiros com erros vão para `data/errors/`.

### Automação com cron

**Linux (crontab):**
```bash
# Toda segunda-feira às 06:00
0 6 * * 1 cd /path/to/lupita-dashboard && npm run auto-import >> /var/log/lupita-import.log 2>&1

# Ou diariamente às 23:00
0 23 * * * cd /path/to/lupita-dashboard && npm run auto-import >> /var/log/lupita-import.log 2>&1
```

**macOS (launchd):**

Criar `~/Library/LaunchAgents/com.lupita.autoimport.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lupita.autoimport</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>tsx</string>
        <string>scripts/auto-import.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/lupita-dashboard</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>1</integer>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/lupita-import.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/lupita-import-error.log</string>
</dict>
</plist>
```

Activar: `launchctl load ~/Library/LaunchAgents/com.lupita.autoimport.plist`

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts + framer-motion
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcrypt
- **XLSX parsing**: SheetJS

## Estrutura

```
/lupita-dashboard
├── client/          # React frontend
├── server/          # Express backend
├── scripts/         # Seed e auto-import
├── data/
│   ├── inbox/       # XLSX para processar
│   ├── processed/   # XLSX já importados
│   └── errors/      # XLSX com erros
├── lupita.db        # SQLite (gerado)
└── .env             # Configuração
```
