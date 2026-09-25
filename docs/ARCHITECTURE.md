# Architecture

Job Portal & Recruitment Management System: React + Express + MongoDB, TypeScript end to end, one shared contracts package.
This document explains how the system is put together, why, and what it measured.

## 1. Requirements map (fixed baseline, FR-01..FR-08)

| FR | What | Where it lives |
|---|---|---|
| FR-01 | Seeker register/login/logout, profile, resume | `modules/auth`, `modules/profiles`, `infra/gridfs.ts` |
| FR-02 | Recruiter, company, vacancies (create/edit/close/delete/list own) | `modules/profiles`, `modules/companies`, `modules/jobs` |
| FR-03 | Job listing with all fields + detail page | `modules/jobs` (`searchPublic`, `getPublic`) |
| FR-04 | Search/filter by title, location, skills, experience, type (AND-combined) | `modules/jobs/jobs.service.ts` |
| FR-05 | Apply once, view applications, status, history | `modules/applications` (unique `{job, applicant}` index) |
| FR-06 | Recruiter sees only own applicants, downloads resumes, updates status | `modules/applications` (ownership stored on the application) |
| FR-07 | Applied -> Shortlisted -> Interview -> Selected, Rejected | `packages/shared/src/status.ts` (one implementation, used by API and UI) |
| FR-08 | Admin CRUD over everything + analytics | `modules/admin` |

The AI/innovation layer is not implemented. It attaches through the domain events in `infra/events.ts` and new modules without editing baseline services.

## 2. System overview

```
 Browser (React + TanStack Query, role-based lazy chunks)
      │  JSON/REST, bearer access token (memory only) + httpOnly refresh cookie
      ▼
 Express (N cluster workers)
   requestLogger → helmet → cors → compression → json(100kb) → rate limit
   routes → zod validation (handle/handleAuthed) → authenticate → requireRole → service
      │
      ▼
 Services (business rules, transactions, domain events) → Mongoose models (lean reads)
      │
      ▼
 MongoDB (single-node replica set: transactions + change streams; GridFS for resumes)

 packages/shared: zod schemas, enums, status workflow, DTO types (imported by server AND client)
```

### Repository layout
```
packages/shared/     contracts: enums, status transitions, zod request schemas, response DTO types
server/src/
  cluster.ts server.ts app.ts       entry points (one worker per core in production)
  config/env.ts                     zod-validated environment; refuses the dev JWT secret in production
  http/                             handle.ts (typed, validated route wrapper), errors, middleware/
  modules/<name>/{routes,service}   auth, profiles, companies, jobs, applications, admin
  models/                           Mongoose models with explicit TypeScript interfaces
  infra/                            db (transactions), cache (ttl, swr, json), changeStreams, gridfs, events, logger
  docs/                             OpenAPI generation + self-hosted Swagger UI
  migrations/                       idempotent backfills, tracked in `_migrations`
client/src/
  app/                              router, guards, lazy role areas, error boundary
  features/<name>/                  auth, jobs, applications, profile, admin: api hooks + pages
  shared/                           http client, UI primitives, toast
bench/  e2e/  scripts/  docs/
```

### Request lifecycle
1. `requestLogger` assigns/propagates `X-Request-Id`; a log line is written only for errors, slow requests or in development.
2. `handle()` / `handleAuthed()` validate `body`, `query`, `params` with the shared zod schema (400 with the first messages), give the handler typed input, and turn thrown `ApiError`s into JSON.
3. `authenticate` verifies the JWT (cached per token), checks the account is active (cached 60 s, invalidated instantly on deactivation), sets `req.user`.
4. `requireRole` enforces the role. **Ownership** (a recruiter's own jobs/applicants, a seeker's own application) is enforced in services, never in the UI.
5. The service does the work, emits a domain event, and the route returns DTOs (`_id` becomes `id`).

## 3. Data model and the read path

Documents are shaped for how they are read.

- **Embed** what is always read together: `statusHistory[]`, education/experience, resume metadata.
- **Snapshot** display fields where a join would be paid on every list: `Job.companyName/companyLogoUrl`, and on `Application`: `recruiter`, `applicantName/Email`, `jobTitle/jobLocation`, `companyName`, `company`. Lists become a single indexed query. Snapshots are kept in sync in the same transaction as the edit (company rename, job title/location edit).
- **Search mirrors** (`titleTokens`, `locationLower`, `requiredSkillsLower`) give case-insensitive search that still uses indexes.
- **Every listing sorts newest-first with `_id` as tie-breaker** so every index ends in `createdAt, _id` and Mongo returns rows already ordered. There is no in-memory sort stage.

Indexes (`autoIndex` is off; `npm run db:migrate` or the cluster primary syncs them once, so workers never race):

| Collection | Index | Serves |
|---|---|---|
| jobs | `{status, createdAt↓, _id↓}` | default list, cursor paging |
| jobs | `{status, employmentType, createdAt↓, _id↓}` | type filter |
| jobs | `{status, employmentType, experienceRequired, locationLower}` | selective filter combos |
| jobs | `{status, requiredSkillsLower, createdAt↓, _id↓}` | skills (`$in` merge-sorted) |
| jobs | `{status, titleTokens, createdAt↓, _id↓}` | title search (all words must match) |
| jobs | `{postedBy, createdAt↓, _id↓}` | "my jobs" |
| applications | `{job, applicant}` **unique** | FR-05 duplicate prevention |
| applications | `{applicant, appliedAt↓}`, `{job, appliedAt↓}` | my applications, applicants |
| refreshtokens | `{tokenHash}` unique, `{expiresAt}` TTL | sessions |

**Pagination.** `GET /api/jobs` supports an opaque keyset `cursor` (O(1) at any depth) and `page` for simple clients. Totals are returned on the first page only and cached for 15 s.

## 4. Efficiency design

| Technique | Effect |
|---|---|
| Public `GET /api/jobs` and `/api/jobs/:id`: serialised identity + gzip bodies cached 10 s, single-flight, stale-while-revalidate, ETag/304, `Cache-Control: public` | a hit is a buffer write: no zod, no query, no JSON, no compression |
| Cache invalidation via the `jobs.changed` event and a **MongoDB change stream** in every worker | a write on any worker clears all workers' caches immediately |
| Snapshots + lean reads + projections (no `description` in lists) | one query per list, ~60% smaller payloads |
| Native `bcrypt` (libuv thread pool) | logins do not block the event loop |
| Verified-token and active-user caches | no HMAC / DB hit per authenticated request |
| Cluster: one worker per core, respawn on crash, drain on SIGTERM | scales with cores; a crashed worker costs only its in-flight requests |
| Admin reports: `$group` first, `$limit` before `$lookup`, 60 s stale-while-revalidate cache | dashboard is O(1) per view |
| Client: TanStack Query cache + dedupe, lazy role chunks, fetch-based client (no axios) | fewer API calls, smaller first load |

### Measured (single worker, 20 connections, 20k jobs / 60k applications)

| Endpoint | First cut | Now |
|---|---|---|
| Job list, cache hit | 143 req/s | ~10,800 (load-generator bound) |
| Job list, cache miss (database path) | 143 | ~1,000 |
| Filtered search, miss | 480 | ~1,000 |
| Title search, miss | 68 | ~990 |
| Skills filter, miss | 142 | ~1,180 |
| `GET /jobs/mine` | 340 | ~815 |
| Applicants of a job | 580 | ~1,240 |
| My applications | 515 | ~1,900 |
| Admin top-companies (warm) | 2,285 | ~8,800 |
| Login (bcrypt) | 16 (blocked the server) | ~70, no event-loop stall |

Cache-hit numbers are limited by the load generator (autocannon), not the server. The uncached path scales with workers (about 2.1x with 4 workers on the same machine, which also hosts MongoDB and the load generator). Killing a worker under load cost 1 of 30,577 requests.
Client landing route: ~73 KB gzip (down from 79 KB with everything in one bundle); each role's pages are a 2-3 KB lazy chunk.

Regression budgets live in `bench/budgets.json` (60% of measured throughput, 2.5x p99). `npm run bench` fails if a budget regresses.

## 5. Security

- Passwords: bcrypt (10 rounds), minimum 8 characters, validated at the boundary.
- **Sessions**: 15-minute access JWT held only in browser memory + 7-day refresh token in an `httpOnly; SameSite=Lax` cookie scoped to `/api/auth`, stored **hashed**, rotated on every use. Replaying a rotated token revokes its whole family (theft detection, with a 10 s grace for concurrent tabs). Logout and deactivation revoke server-side. Cookie endpoints require `X-Requested-With`.
- Roles and ownership are enforced on the server for every route; admin cannot self-register (seeded).
- `helmet` CSP, CORS pinned to `CLIENT_URL`, 100 KB JSON limit, 5 MB resume limit with type filter, `simple` query parser (no `?role[$ne]=` operator injection), user input escaped before regex, rate limits (auth endpoints share a MongoDB-backed counter across workers; the global limiter is per worker).
- Resumes are private GridFS files streamed only after an authorisation check; replacing a resume never orphans the copy already sent with an application.
- `JWT_SECRET` must be set to a real value in production (the development default is refused at boot).

## 6. Data integrity

Multi-document writes use transactions on a replica set (registration, company create/rename, job edit/delete, all admin cascades). On a standalone server the same code runs without a session. Mongo has no foreign keys, so cascades are explicit: deleting a user, company or job removes everything that depends on it.

## 7. Observability

pino JSON logs with request ids; `/api/health` (liveness) and `/api/ready` (database); optional Prometheus metrics at `/api/metrics` (`ENABLE_METRICS=true`, per process); interactive API docs at `/api/docs` in development (`ENABLE_DOCS=true` elsewhere), generated from the shared zod schemas. A contract test fails if a route and its documentation drift apart.

## 7b. The interface

Blue, LinkedIn/Indeed-style design system: CSS custom-property tokens (`client/src/styles/tokens.css`, light and dark, system default plus a saved choice applied before first paint by `/theme-init.js`), and a small primitive set in `client/src/shared/ui` (Button, Chip, Avatar, Menu, Tabs, Dialog/Drawer/ConfirmDialog on native `<dialog>`, Stepper, skeletons, empty states, toasts). No UI or chart library; SVG charts expose their numbers as text.

- **Discovery**: hero search, popular chips from live facets, `/jobs` split view (list + selected job, `?job=` deep link) with Date/Type/Salary/Experience/Skills filters, removable chips, live count, newest/salary sort, mobile filter sheet. Filters live in the URL.
- **Seeker**: save jobs, apply through a dialog (inline resume upload), "My jobs" tracker with stage tabs and stepper, profile completeness, in-app notifications.
- **Recruiter**: overview dashboard, jobs table with applicant counts and duplicate, applicants Board/List with drag-and-drop (or the Move menu), bulk moves, and a candidate drawer showing the applicant profile (FR-06).
- **Admin**: KPI cards, SVG charts, filterable/sortable tables (page-local), confirm dialogs.
- **Per-user state stays out of the public cache**: saved/applied ids are fetched separately and merged on the client, so anonymous list responses remain cacheable. Result counts are cached briefly but dropped on any job change (`jobs.changed`, including cross-worker via change streams).
- **Sign-in and registration** use the animated sign-in block (`client/src/components/ui/modern-animated-sign-in.tsx`, shadcn-style folder and `@/` alias). It is the only Tailwind (v3) consumer: preflight is off and its variables and reset are scoped to `.anim-auth` (`styles/anim-auth.css`), so the hand-written Cobalt CSS is untouched. The block and `motion` load only on those two routes (about 57 KB gzip).
- Role areas are lazy chunks; the landing bundle is about 85 KB gzip.

## 8. Quality gates

`npm run verify` = typecheck (shared, server, client, e2e) + Biome lint/format + 92 server tests + production builds.
`npm run e2e` runs a Playwright suite against the **production build on two cluster workers**: full seeker/recruiter/admin journey, cookie/session behaviour, role guards, deep links, cursor paging, discovery filters/chips/sort, saved jobs, theme persistence, phone layout (no sideways scroll), the recruiter board (drag and drop honouring allowed transitions, bulk moves), and **axe WCAG 2.1 AA scans of every main page in light and dark with zero serious/critical violations**. `SHOTS=1 npx playwright test e2e/screenshots.spec.ts` captures 390/768/1440 px screenshots into `screenshots/` for visual review.
CI (`.github/workflows/ci.yml`) runs all of it against a MongoDB replica set; `bench.yml` is a manual throughput run.

## 9. Decisions worth knowing

- **MongoDB kept** (as requested) with a single-node replica set locally for transactions/change streams. Standalone still works.
- **GridFS** for resumes: one datastore, survives redeploys, streams both ways.
- **Snapshots over joins**: the read path is the hot path; the write path pays one `updateMany` in a transaction on the rare rename/edit.
- **Title search is "all words, newest first"** rather than relevance-ranked. That is what makes it index-ordered. Relevance ranking (Atlas Search / Meilisearch) is the upgrade path.
- **Per-worker caches** (token, active-user, reports) are TTL-bounded; job caches are invalidated cluster-wide by change streams.
- **TypeScript 7 (native compiler)** is used; Biome replaces ESLint/Prettier because typescript-eslint does not yet support it.

## 10. Running it

See the README. Everything is local: MongoDB on `127.0.0.1:27017` (`npm run db:start`, one-time `npm run db:init`), API on 5000, Vite on 5173 in development, or one process on one port in production.
