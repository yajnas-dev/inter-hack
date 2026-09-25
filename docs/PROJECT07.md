# Project 07 — Job Portal & Recruitment Management System

A versioned REST API (Express + MongoDB, TypeScript) for job seekers, recruiters and administrators, with a React client and an AI resume-to-job match feature. The API is the product. The React app is one client of it, and it does not rely on anything a mobile or third-party client could not do.

Related documents: [API.md](API.md) (endpoint reference), [VIVA.md](VIVA.md) (design questions and answers). The OpenAPI spec is served at `/api/v1/openapi.json`.

---

## 1. Requirements coverage

| # | Requirement | Where it is implemented |
|---|---|---|
| 1 | Seekers register, create profiles, upload resumes | `POST /auth/register`, `PATCH /users/me/profile`, `POST /resumes` (`modules/auth`, `modules/users`, `modules/resumes`) |
| 2 | Recruiters register company profiles and create vacancies | `POST /companies`, `POST /jobs` (`modules/companies`, `modules/jobs`) |
| 3 | Jobs show title, company, location, salary range, skills, experience | `JobListItem` / `JobDetail` DTOs (`GET /jobs`, `GET /jobs/:id`) |
| 4 | Search/filter by title, location, skills, experience, employment type | `GET /jobs?title&location&skills&experience&employmentType` (+ salary, date, company, sort) |
| 5 | Seekers apply and track status | `POST /applications`, `GET /applications`, `GET /applications/:id` (history) |
| 6 | Recruiters view applicants, download resumes, update status | `GET /jobs/:jobId/applications`, `GET /resumes/:id/file`, `PATCH /applications/:id` |
| 7 | Applied, Shortlisted, Interview, Selected, Rejected | `packages/shared/src/status.ts`, enforced in `applications.service.ts` |
| 8 | Admin manages users, companies, jobs, applications, reports | `/admin/*`, `/reports/*` |
| AI | One practical AI feature | Resume ↔ job match analysis: `POST /jobs/:jobId/match`, `POST /applications/:id/match` |

---

## 2. Architecture

```
 Clients: React SPA (this repo) · mobile/CLI/3rd party (same contract)
      │ HTTPS, JSON, Authorization: Bearer <JWT>
      ▼
 Express app (one worker per CPU core, cluster primary respawns crashed workers)
   requestLogger → helmet → CORS allow-list → compression
   /api: no-store → rate limit → content-type check → JSON parser (100 KB)
   /api/v1 router ─┬─ route: method + path + authenticate + requireRole
                   ├─ controller: validate body/query/params (zod) → call service → Reply
                   ├─ service: business rules, object-level authorisation, workflows, events
                   ├─ repository: every MongoDB query (Mongoose models, lean reads)
                   └─ central error handler: any error → { success:false, error:{code,message,details} }
      ▼
 MongoDB replica set (transactions + change streams) · GridFS bucket "resumes" (private files)
      ▲
 AI provider adapter (Anthropic SDK) ← matching service only; key never leaves the server

 packages/shared: zod request schemas, enums, status workflow, response DTO types — imported by server AND client
```

### Layers and their rules

| Layer | Location | May | May not |
|---|---|---|---|
| Route | `modules/*/*.routes.ts` | Declare method, path, `authenticate`, `requireRole`, and middleware such as upload or rate limit | Contain logic |
| Controller | `modules/*/*.controller.ts` | Declare accepted inputs (zod), call one service, shape the HTTP reply (status, `Location`, headers) | Touch the database; format errors |
| Service | `modules/*/*.service.ts` | Business rules, object-level authorisation (`policies/access.ts`), transactions, domain events | Import Express or read `req`/`res` |
| Repository | `repositories/*.repository.ts` | Every query, projection, index-aware filter, aggregation | Make business decisions |
| Presenter | `utils/presenters.ts` | Map documents to DTOs field by field (an allow-list) | Spread documents (which could leak fields) |
| Infra | `infra/*` | Database connection, transactions, storage, caches, events, logger | Contain domain rules |

This separation exists for concrete reasons:

- The same service is reachable from any transport and is testable without HTTP. The AI matcher, for example, reuses the applications service's authorisation rather than re-implementing it.
- Queries are in one place per collection, which is where index design happens.
- Presenters are allow-lists, so adding a field to a model (a hash, an internal id, notes) never exposes it by accident.

### Source layout

```
packages/shared/src/      enums.ts (roles, statuses, error codes), schemas.ts (every request contract),
                          dto.ts (every response shape + envelope), status.ts (workflow table)
server/src/
  app.ts, routes.ts       middleware order; /api/v1 composition
  config/env.ts           zod-validated configuration; refuses weak secrets in production
  http/                   controller.ts (validation + reply), respond.ts, errors.ts, middleware/
  policies/access.ts      object-level authorisation (IDOR/BOLA defence)
  modules/<name>/         routes → controller → service for auth, users, companies, jobs,
                          applications, resumes, notifications, admin, reports, matching (AI), health
  repositories/           data access per collection
  models/                 Mongoose schemas, validators, indexes
  infra/                  db, storage/resumeStorage (GridFS), cache/, changeStreams, events, logger
  migrations/             idempotent data migrations (tracked in _migrations)
  docs/                   OpenAPI generation + self-hosted Swagger UI
server/tests/             Vitest + Supertest API tests (see §9)
client/src/               React + TanStack Query; shared/api/http.ts unwraps the envelope in one place
e2e/                      Playwright journeys + axe accessibility scans on the production build
bench/                    load test with regression budgets
```

---

## 3. API design

- **Versioning.** Everything lives under `/api/v1`. A breaking change would ship as `/api/v2` mounted alongside it (`routes.ts`). Unversioned `/api/...` paths return 404 with a hint.
- **Resources.** `auth`, `users/me`, `companies`, `jobs`, `applications`, `resumes`, `notifications`, `admin`, `reports`, `health`. The URLs contain nouns only; state changes are `PATCH`es of a field:
  - closing a job: `PATCH /jobs/:id {status:"CLOSED"}`, not `/jobs/:id/close`
  - moving an application: `PATCH /applications/:id {status}`, not `/applications/:id/status`
- **Methods.** `GET` reads, `POST` creates (or runs a computation: `…/match`), `PATCH` partially updates, `PUT` replaces or idempotently sets (`/users/me/password`, bookmarks), `DELETE` removes. Deletes and idempotent sets return 204.
- **Caller-scoped collections.** `GET /applications` returns different rows for a seeker, a recruiter and an admin. The scope is part of the database query, so a filter can only narrow it.
- **Envelope and errors.** One success shape and one error shape, with stable `error.code` values (see API.md §1).
- **Status codes.** 201 with `Location` on create; 204 on no-content; 409 for state conflicts; 422 for validation; 415/413 for media problems; 429 with `Retry-After`.
- **Pagination.** `page`/`limit` everywhere, with `limit` capped at 100. `/jobs` also supports opaque keyset cursors for every sort order.
- **Tolerant reader, strict values.** Unknown keys are ignored (which also blocks mass assignment); present values are validated and rejected if invalid, never silently clamped.

---

## 4. Database design

### Collections

| Collection | Purpose | Key fields | Relationships |
|---|---|---|---|
| `users` | Accounts | `email` (unique, lower-cased), `password` (bcrypt, `select:false`), `role`, `isActive`, `sessionsValidAfter` | 1 ↔ 1 profile |
| `jobseekerprofiles` | Seeker profile | `user` (unique), skills, embedded `education[]`/`experience[]`, `totalExperienceYears`, `resume` → Resume | User → Profile → current Resume |
| `recruiterprofiles` | Recruiter profile | `user` (unique), `company` → Company | User → Company |
| `companies` | Company profile | `name`, `nameLower` (search mirror), `createdBy` (**unique**: one company per recruiter) | Company → Jobs |
| `jobs` | Vacancies | `company` (owner), `postedBy`, salary range, skills, experience, type, `status`; snapshot `companyName/Logo`; search mirrors `titleTokens`, `locationLower`, `requiredSkillsLower` | Job → Applications |
| `applications` | One per (job, applicant) | `job`, `applicant`, `company` (authorisation key), `resume` → Resume, `status`, `statusHistory[]`, private `notes[]`; display snapshots | User → Applications; Application → Resume |
| `resumes` | File metadata | `owner`, `fileId` (GridFS, unique), sanitised `originalName`, detected `mimeType`, `size`, `sha256`, private extracted `text`, `archivedAt` | bytes in `resumes.files` / `resumes.chunks` |
| `refreshtokens` | Sessions | `tokenHash` (unique, SHA-256), `family`, `expiresAt` (TTL), `revokedAt` | User → sessions |
| `savedjobs` | Bookmarks | unique `{user, job}` | |
| `notifications` | In-app messages | `user`, `readAt`; TTL 90 days | |
| `matchanalyses` | AI result cache | unique `{job, candidate, fingerprint}`; TTL 7 days | justified by cost: each miss is a paid model call |
| `rate_limits` | Cross-worker limit counters | TTL on `expiresAt` | |

### Modelling decisions

- **References where data has its own lifecycle; embedding where it is always read together.** Education, experience, status history and notes are embedded (bounded arrays with validators). Companies, jobs, applications and resumes are referenced.
- **Resume as a first-class document.** Uploads are immutable, so an application points at exactly the file that was sent. A recruiter can never be handed a newer file the candidate uploaded later. This also gives resume downloads a single authorisation rule and gives the AI feature a place to store extracted text.
- **Snapshots for join-free lists.** Applications copy the job title/location, company name and applicant name/email; jobs copy the company name/logo. Lists are one indexed query. Renames update the snapshots **in the same transaction** as the edit.
- **Integrity without foreign keys.** Cascades are explicit and transactional (admin deletes; job delete). GridFS bytes are removed after the transaction commits, and only when no application references them.
- **Constraints at two levels.** Every request is validated by zod, and Mongoose schema validators (max lengths, enums, salary range, array limits) back it up. Unique indexes are the source of truth under concurrency: duplicate applications, duplicate emails and a second company all fail at the index even when two requests race.

### Indexes and the queries they serve

| Index | Query |
|---|---|
| `jobs {status, createdAt↓, _id↓}` | default search and cursor paging |
| `jobs {status, salaryMax↓, _id↓}` | salary sort (and reverse for ascending) |
| `jobs {status, employmentType, createdAt↓, _id↓}` | type filter |
| `jobs {status, employmentType, experienceRequired, locationLower}` | combined filters |
| `jobs {status, requiredSkillsLower, createdAt↓, _id↓}` | skills filter |
| `jobs {status, titleTokens, createdAt↓, _id↓}` | title search (all words) |
| `jobs {status, company, …}` / `{company, createdAt↓}` | company page / recruiter's jobs |
| `applications {job, applicant}` **unique** | duplicate prevention |
| `applications {applicant, appliedAt↓}` | seeker's applications |
| `applications {job, status, appliedAt↓}` / `{job, appliedAt↓}` | applicants of a job, by stage |
| `applications {company, appliedAt↓}` / `{company, status, appliedAt}` | recruiter dashboard and lists |
| `applications {resume, company}` | "was this resume sent to my company?" (download authorisation) |
| `applications {appliedAt↓}` | admin list and the time-series report |
| `users {role, createdAt↓}`, `companies {createdBy}` unique, `{nameLower}` | admin tables and search |
| `refreshtokens {tokenHash}` unique, `{expiresAt}` TTL | sessions |

Every list sorts by an indexed key plus `_id`, so MongoDB returns rows already in order (no in-memory sort) and paging is stable. Paging always has a limit (≤ 100). Per-row counts (applicants per job, open jobs per company) are one grouped `$in` query per page, not N+1 queries. Report aggregations `$group` first and `$limit` before any lookup.

### Migrations

`npm run db:migrate` applies pending migrations (tracked in `_migrations`) and then syncs indexes. Migration `003-resume-documents` converted the embedded resume metadata into `resumes` documents (computing each file's SHA-256 from GridFS) and backfilled `companies.nameLower`. Every migration is idempotent.

---

## 5. Authentication

- **Passwords.** bcrypt (12 rounds; 4 in tests), with 8–72 bytes and at least one letter and one number. The hash is never selected by default and never serialised.
- **Access token.** HS256 JWT with claims `sub`, `role`, `iat`, `exp` (15 minutes), `iss` and `aud`. Verification pins the algorithm, issuer and audience, so `alg:none`, tokens meant for another audience, and forged roles are all rejected (each has a test).
- **Refresh token.** 256 random bits, opaque, stored only as a SHA-256 hash, and rotated on every use. Reuse of a rotated token (outside a 10-second grace window for parallel tabs) revokes the whole token family.
- **Transport.**
  - Browsers: an `HttpOnly; SameSite=Strict` cookie scoped to `/api/v1/auth` (`Secure` in production). The access token lives only in memory, never in `localStorage`.
  - Native clients: send `X-Token-Transport: body` and keep the token themselves.
- **CSRF.** Only the refresh/logout endpoints accept a cookie, and they require `X-Requested-With`, which a cross-site form cannot send. Every other endpoint needs a bearer header, which browsers never attach automatically.
- **Revocation.** Logout revokes the token family. Password change, deactivation and deletion set `sessionsValidAfter`, so outstanding access tokens stop working within seconds, not in 15 minutes. The account state is cached for 30 seconds and invalidated immediately on the worker that made the change.
- **No user enumeration.** Unknown email and wrong password return the same 401, and take about the same time (a dummy bcrypt comparison runs when the email is unknown).

## 6. Authorisation (RBAC and ownership)

Two layers:

1. **Role (RBAC)** in the router: `requireRole('RECRUITER')` etc. Answers 403 `FORBIDDEN`. The `/admin` and `/reports` routers are ADMIN-only as a whole.
2. **Object ownership** in services, through `policies/access.ts`:

| Resource | Rule | On failure |
|---|---|---|
| Job (modify) | admin, or a recruiter whose company owns the job | 403 (jobs are public) |
| Company (modify) | the recruiter whose profile belongs to it | 403 |
| Application (read) | the applicant, the hiring company's recruiters, admins | **404** |
| Application (move, notes, applicant profile, AI) | the hiring company's recruiters, admins | 403 for the applicant; 404 for others |
| Resume (read or download) | the owner, admins, or a recruiter whose company **received that resume** | **404** |
| Resume (delete) | the owner | 404 |

Private objects answer 404 rather than 403, so probing ids reveals nothing. The client never supplies ownership: the company of a new job, the applicant of an application and the owner of an upload are all taken from the token.

## 7. Security review

| Threat | Mitigation | Verified by |
|---|---|---|
| IDOR/BOLA (changing ids in URLs) | Object policies in every service; caller-scoped queries; 404 for private objects | `applications.test.ts` "who sees which application", `resumes.test.ts` "downloading", `ai.test.ts` |
| Privilege escalation / mass assignment | zod allow-lists; `role` fixed at registration (ADMIN seeded only); ownership from the token | `security.test.ts` "mass assignment", `auth.test.ts` role forgery |
| NoSQL operator injection | Flat query parser; zod types; `strictQuery`; regex input escaped | `auth.test.ts`, `jobs.test.ts` (`?title[$ne]=`, `.*`) |
| Brute force / credential stuffing | Per-IP auth limiter shared across workers (MongoDB store); bcrypt cost | `ratelimit.test.ts` |
| Token theft | Short-lived access tokens held in memory; httpOnly strict cookie; rotation with reuse detection | `auth.test.ts` refresh suite |
| CSRF | Bearer-only API; `X-Requested-With` on cookie endpoints; SameSite=Strict | `auth.test.ts` |
| Malicious uploads | Magic-byte detection, extension match, macro rejection, 5 MB cap, one part only, sanitised names, private storage, attachment downloads with nosniff and a sandbox CSP | `resumes.test.ts` (7 spoofing cases, traversal, size, malformed multipart) |
| Zip bombs (DOCX extraction) | inflate output capped at 4 MB, text capped | `utils/fileInspection.ts` |
| XSS via stored URLs | `website` and `logoUrl` must be http(s) | `security.test.ts` |
| Information disclosure | Central error handler: 500s return a generic message and a request id, never stacks; explicit presenters | `security.test.ts` (forced 500) |
| IP spoofing to evade limits | `TRUST_PROXY` is configurable and off by default | configuration |
| DoS via payloads | JSON 100 KB, `limit` ≤ 100, bounded arrays, 415 for unexpected content types | `security.test.ts`, `jobs.test.ts` |
| Weak configuration | zod-validated env; production refuses a missing or short `JWT_SECRET`; `Secure` cookie by default in production | `config/env.ts` |
| Transport headers | helmet (CSP, HSTS, nosniff, frameguard), CORS allow-list, `Cache-Control: no-store` on private data | `security.test.ts` |
| Prompt injection via resumes | The system prompt treats resume/profile text as untrusted data; output schema-constrained and re-validated; the AI result is advisory only (it changes nothing) | `ai.provider.test.ts` |

Known limits, and the next steps: uploads are not virus-scanned (add ClamAV or a cloud scanner before storing); the global rate limiter counts per worker (move it to Redis when there are several hosts); refresh tokens are not bound to a device fingerprint.

---

## 8. Application workflow

`APPLIED → SHORTLISTED → INTERVIEW → SELECTED`, with `REJECTED` reachable from any stage before `SELECTED`. `SELECTED` and `REJECTED` are final. The table lives in `packages/shared/src/status.ts` and is shared by the API and the recruiter board.

Enforcement, in `applications.service.ts#updateStatus`:

1. Load the application. Callers who may not see it get 404.
2. Check that the caller reviews for the hiring company (or is an admin). The applicant gets 403.
3. `isValidTransition(current, next)` fails → 409 `INVALID_STATUS_TRANSITION`, with the allowed next steps in the message.
4. Conditional update `{_id, status: current}` → `$set status`, `$push statusHistory {status, changedBy, changedAt}`. No match (someone moved it first) → 409 `CONCURRENT_UPDATE`.
5. Emit `application.statusChanged`; the notifications module tells the applicant.

Applying: the job must be OPEN (409 `JOB_CLOSED`), the seeker must have a resume (422 `RESUME_REQUIRED`), and the unique `{job, applicant}` index guarantees one application per job even under concurrent submits (tested with five parallel requests).

---

## 9. AI feature: resume ↔ job match analysis

**What it does.** A seeker clicks "Analyse my fit" on a job. The hiring company's recruiter clicks "Analyse fit" in a candidate's drawer. Both get a 0–100 score, a verdict, matched and missing skills, strengths, gaps, and (for seekers) concrete resume improvements.

**Why this feature.** It uses data the platform already holds (resumes, profiles, job requirements) and helps both sides: seekers learn what to improve, recruiters triage faster. It is advisory: nothing is decided automatically.

**How it flows** (`modules/matching`):

1. **Authorisation first.** The seeker endpoint uses the caller's own profile and current resume. The recruiter endpoint goes through `applications.reviewableApplication`, the same policy as every other application action, and uses the **resume that was sent** with the application.
2. **Inputs.** Job fields, profile (skills, stated years, dated roles, education), and the resume: a PDF is passed to the model as a document block; DOCX text was extracted at upload; legacy DOC is flagged as unreadable in `warnings`.
3. **Cache.** A fingerprint of (model, job `updatedAt`, profile `updatedAt`, resume id) is looked up in `matchanalyses`. A hit returns immediately with `cached: true`.
4. **Provider** (`provider.ts`, the only file that knows about Anthropic):
   - Anthropic SDK; model `claude-opus-5` by default (`AI_MODEL`); `effort: low` for interactive latency.
   - Structured output via a JSON schema (`output_config.format`).
   - Server-side refusal fallbacks enabled.
   - SDK timeout per attempt, one retry, and an overall abort deadline.
5. **Defensive handling.** The answer is parsed and **re-validated with zod** (range, types, sizes). Refusal, truncation, invalid JSON, wrong shape, timeout, rate limit, bad credentials and network errors each map to a reason code.
6. **Graceful degradation.** On any failure, or when no key is configured, the deterministic heuristic produces the answer (`engine: "heuristic"`, reason in `warnings`). The endpoint returns 200 with a clearly labelled estimate instead of an error.
7. **Cost control.** 30 analyses per user per hour (shared across workers); results cached for up to 7 days.
8. **Safety.** The API key is read from the server environment and never sent to clients. The system prompt tells the model to treat resume text as untrusted data and to ignore protected characteristics.

The heuristic: required skills found in the listed skills or the resume text (70%), plus years against the requirement (30%). Its results are explainable and it is unit-tested.

---

## 10. Testing

`npm test` (server, needs the local MongoDB replica set) runs **186 tests in 12 files**:

| Suite | Covers |
|---|---|
| `auth.test.ts` | registration, hashing, duplicates, validation details, login, uniform bad-credential answers, NoSQL injection, missing/expired/invalid/forged/`alg:none`/wrong-issuer/wrong-audience tokens, refresh rotation, CSRF header, theft detection, logout, native body transport, password change revoking all sessions |
| `jobs.test.ts` | create (company from token), COMPANY_REQUIRED, field and cross-field validation, role checks, update/close/reopen, cross-company 403, delete rules, snapshot sync, recruiter's jobs, detail/404/422, similar, facets, every filter, AND-combination, sorting both ways, regex escaping, invalid-filter 422s, page meta, limit caps, cursor paging over all four sorts, tampered/mismatched cursors, admin moderation |
| `applications.test.ts` | apply, RESUME_REQUIRED, duplicate (sequential and 5 concurrent), JOB_CLOSED, caller-scoped lists, filters cannot widen scope, IDOR 404s, applicant cannot self-review, full workflow, 6 invalid transitions, rejection from each stage, reviewer race, notifications, applicant lists with skill overlap, private notes, applicant profile, dashboard scoping |
| `resumes.test.ts` | PDF and DOCX upload, DOCX text extraction, 7 spoofed-type cases, empty, oversize, wrong field, missing file, non-multipart, malformed multipart, filename sanitising, download headers, the recruiter/rival/other-seeker/admin matrix, other-resume isolation, replacement and deletion retention |
| `admin.test.ts` | admin-only on every route, user filters and paging, immediate deactivation, self-protection, user and company cascades (including GridFS bytes), job and application lists, reports |
| `ai.test.ts` | AI path with caching and fingerprint invalidation, heuristic path, 5 failure modes contained, DOCX text to provider, PROFILE_INCOMPLETE, 404/403/401, recruiter analysis uses the sent resume, rival 404 |
| `ai.provider.test.ts` | the Anthropic adapter with the SDK mocked: request shape (document block, JSON schema, fallbacks, abort signal), non-JSON, wrong shape, missing fields, refusal, truncation, connection timeout, deadline, 429, 401, 500, network error, untrusted resume text framing |
| `security.test.ts` | headers, request ids, cache headers, CORS, 413, 400, 415, route 404 hint, generic 500, mass assignment on register/profile/job/company, `javascript:` URLs, snapshot sync |
| `ratelimit.test.ts` | login limit → 429 with `Retry-After`; per-user AI limit |
| `contract.test.ts` | every route documented and every documented route exists; anonymous access is 401 on protected routes and never 401/403 on public ones; every JSON response uses the envelope; OpenAPI shape; docs served |
| `unit.test.ts` | workflow table, query parsing, file detection, sanitising, DOCX extraction, cursor encoding, heuristic scoring |
| `swrCache.test.ts` | cache semantics |

Other checks:

- `npm run e2e`: Playwright against the production build on two cluster workers (seeker/recruiter/admin journeys, sessions, paging, pipeline board, axe WCAG 2.1 AA scans in light and dark themes).
- `npm run verify`: typecheck (shared, server, client, e2e) + Biome lint + tests + production builds.

---

## 11. Running and deployment

**Local development**

```bash
npm install
npm run db:start            # mongod as a single-node replica set (keep open)
npm run db:init             # once
cp server/.env.example server/.env   # set JWT_SECRET; optionally ANTHROPIC_API_KEY
npm run db:migrate          # migrations + indexes (idempotent)
npm run seed:admin          # first admin (admins cannot self-register)
npm run dev                 # API :5000 (docs at /api/v1/docs)
npm run dev:client          # UI :5173 (proxies /api)
```

**Production**

```bash
npm run build               # server bundle + client build
NODE_ENV=production JWT_SECRET=<≥32 random chars> MONGO_URI=... CLIENT_URL=https://your.domain \
TRUST_PROXY=1 ANTHROPIC_API_KEY=... npm start   # one process per core, serves API + UI on one port
```

- Put the app behind HTTPS (the refresh cookie is `Secure` in production). Set `TRUST_PROXY` to the number of proxies in front of it.
- Use a MongoDB replica set (Atlas or self-hosted) so transactions and change-stream cache invalidation are active. A standalone server works with weaker guarantees.
- Probes: liveness `GET /api/v1/health`, readiness `GET /api/v1/health/ready`. Optional Prometheus metrics (`ENABLE_METRICS=true`) at `/api/metrics`.
- Logs are JSON lines (pino) with request ids. Authorization headers and cookies are redacted.

## 12. Performance notes

- Anonymous job reads are served from a pre-serialised (identity + gzip) cache with ETag/304 and single-flight refresh. A MongoDB change stream in every worker clears it when any worker writes a job.
- Search totals are cached for 15 seconds and dropped on any job change. Facets are cached for 5 minutes; reports for 60 seconds.
- Keyset pagination is O(1) at any depth. List projections exclude the job description. Lean reads throughout.
- Native bcrypt runs on the libuv thread pool (logins do not block the event loop). Cluster: one worker per core.
- `bench/` seeds 20k jobs and 60k applications and fails if throughput regresses below `bench/budgets.json`.
