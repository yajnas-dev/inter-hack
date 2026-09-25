# Job Portal & Recruitment Management System

React + Express + MongoDB (TypeScript). Job seekers, recruiters and admins; search and filtering; applications with a fixed status workflow; admin reports.
Design, measurements and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites
- Node 22+ and npm
- MongoDB 6+ running as a **single-node replica set** (enables transactions and change streams). A standalone server also works, with transactions disabled.

## First-time setup
```bash
npm install
npm run db:start          # keep this terminal open (starts mongod with --replSet rs0)
npm run db:init           # once: initiates the replica set
cp server/.env.example server/.env        # then set JWT_SECRET
npm run db:migrate        # creates indexes (safe to re-run)
npm run seed:admin        # creates the first admin (admins cannot self-register)
```
`db:start` points at the MongoDB install path on this machine; adjust it in the root `package.json` if yours differs.

## Develop
```bash
npm run dev               # API on http://localhost:5000 (tsx watch)
npm run dev:client        # UI on http://localhost:5173 (proxies /api)
```
API docs (development): http://localhost:5000/api/docs

## Production (one process, one port)
```bash
npm run build             # server bundle + client build
JWT_SECRET=<long random> MONGO_URI=... npm start   # serves API and UI; one worker per core
```

## Quality
| Command | What it does |
|---|---|
| `npm run verify` | typecheck + lint + 92 server tests + builds |
| `npm test` | server tests (need the replica-set MongoDB; use `server/.env.test`) |
| `npm run e2e` | Playwright against the production build on 2 workers (journeys, pipeline board, axe accessibility scans) |
| `npm run bench:seed && npm run bench` | 20k jobs / 60k applications load test with budgets |
| `npm run lint:fix` | Biome format + safe fixes |

## Configuration (`server/.env`)
`MONGO_URI`, `MONGO_URI_TEST`, `JWT_SECRET` (required in production), `PORT`, `CLIENT_URL`, `ACCESS_TOKEN_TTL` (15m), `REFRESH_TOKEN_TTL_DAYS` (7), `COOKIE_SECURE`, `WEB_CONCURRENCY`, `LOG_LEVEL`, `LOG_ACCESS`, `ENABLE_METRICS`, `ENABLE_DOCS`. Invalid values fail fast at boot with a clear message.
