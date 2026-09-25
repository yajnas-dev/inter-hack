# Job Portal & Recruitment Management System (Project 07)

A versioned REST API (Express + MongoDB, TypeScript) for job seekers, recruiters and administrators, a React client that consumes it, and an AI resume ↔ job match analysis.

| Document | Contents |
|---|---|
| [docs/PROJECT07.md](docs/PROJECT07.md) | Architecture, API design, database, auth, RBAC, security review, workflow, AI feature, testing, deployment |
| [docs/API.md](docs/API.md) | Endpoint reference: envelope, errors, pagination, every route, examples |
| [docs/VIVA.md](docs/VIVA.md) | Design questions and answers |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Demo data (`npm run seed:demo`), the 3 demo accounts, hosting the API on Render |
| `GET /api/v1/openapi.json`, `/api/v1/docs` | OpenAPI 3 spec and Swagger UI (development by default) |

## Prerequisites
- Node 22+ and npm
- MongoDB 6+ running as a **single-node replica set** (enables transactions and change streams). A standalone server also works, with transactions disabled.

## First-time setup
```bash
npm install
npm run db:start          # keep this terminal open (starts mongod with --replSet rs0)
npm run db:init           # once: initiates the replica set
cp server/.env.example server/.env        # then set JWT_SECRET (and optionally ANTHROPIC_API_KEY)
npm run db:migrate        # migrations + indexes (safe to re-run)
npm run seed:admin        # creates the first admin (admins cannot self-register)
```
`db:start` points at the MongoDB install path on this machine; adjust it in the root `package.json` if yours differs.

## Develop
```bash
npm run dev               # API on http://localhost:5000/api/v1 (tsx watch)
npm run dev:client        # UI on http://localhost:5173 (proxies /api)
```

## Production (one process per core, one port)
```bash
npm run build             # server bundle + client build
NODE_ENV=production JWT_SECRET=<32+ random chars> MONGO_URI=... CLIENT_URL=https://your.domain npm start
```

## Quality
| Command | What it does |
|---|---|
| `npm run verify` | typecheck (all workspaces + e2e) + Biome lint + server tests + production builds |
| `npm test` | API tests against the local replica set (`server/.env.test`) |
| `npm run e2e` | Playwright against the production build on 2 workers (journeys, sessions, pipeline board, axe WCAG 2.1 AA scans) |
| `npm run bench:seed && npm run bench` | 20k jobs / 60k applications load test with regression budgets |
| `npm run lint:fix` | Biome format + safe fixes |

## Configuration (`server/.env`)
See [server/.env.example](server/.env.example). Key settings:

| Area | Variables |
|---|---|
| Database | `MONGO_URI`, `MONGO_URI_TEST` |
| Auth | `JWT_SECRET` (required in production, ≥ 32 chars), `ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS` (7), `COOKIE_SECURE` |
| HTTP | `CLIENT_URL` (CORS allow-list), `TRUST_PROXY` |
| Rate limits | `RATE_LIMIT_PER_MIN`, `AUTH_RATE_LIMIT`, `AI_RATE_LIMIT_PER_HOUR` |
| AI | `ANTHROPIC_API_KEY`, `AI_MODEL` (`claude-opus-5`), `AI_TIMEOUT_MS` |
| Operations | `WEB_CONCURRENCY`, `LOG_LEVEL`, `ENABLE_METRICS`, `ENABLE_DOCS` |

Invalid values fail fast at boot with a clear message. Without `ANTHROPIC_API_KEY` the match endpoints return a clearly labelled rule-based estimate.
