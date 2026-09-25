# Viva preparation — Project 07 Job Portal

Short, defensible answers, each tied to where it lives in the code. "Where" paths are relative to `server/src` unless stated.

---

### Why REST?
The domain is a set of resources (users, companies, jobs, applications, resumes) with create/read/update/delete lifecycles, which is exactly what REST models. REST over HTTP gives every client (browser, mobile app, script) the same contract, and it reuses HTTP's own machinery instead of reinventing it: status codes, caching (the public job list uses `ETag`/`304` and `Cache-Control`), content negotiation, and the `Authorization` header. The API is versioned (`/api/v1`) so it can evolve without breaking existing clients. GraphQL was not needed: the screens map cleanly to resources, and REST keeps caching and rate limiting simple.

### Why Express?
It is small, mature and explicit: middleware runs in the order you write it, so the security pipeline is readable in `app.ts` (helmet → CORS → rate limit → content-type check → JSON parser → routes → error handler). It imposes no architecture, so the layers (route → controller → service → repository) are our own and visible in the folder structure. The ecosystem covers what we needed (helmet, cors, express-rate-limit, multer).

### Why MongoDB?
Profiles are naturally document-shaped (education and experience are nested lists), job skills are arrays that can be indexed directly (multikey indexes), and the read path benefits from denormalised snapshots (a list of applications is one indexed query, with no joins). Running it as a replica set still gives us **multi-document transactions** (used for registration, company renames, cascades) and **change streams** (used to invalidate caches across workers). GridFS keeps resume files in the same datastore, private and backed up with the data.

### Why JWT?
Access tokens are verified with a signature check, so authenticated requests need no session lookup, and every worker process (and a mobile app) can use the same token. The weaknesses of JWTs are handled explicitly:
- **Short lifetime** (15 minutes) plus a **rotating refresh token**, so a stolen access token is useful only briefly.
- **Pinned algorithm, issuer and audience**, so `alg:none` and forged tokens fail.
- **Revocation** through `sessionsValidAfter`, so password change or deactivation cuts access immediately.
- **In-memory storage in the browser**, so XSS cannot read the token from storage.
(`http/middleware/auth.ts`, `modules/auth/auth.service.ts`)

### Why RBAC?
Three roles have genuinely different capabilities (seeker, recruiter, admin). A role check in the router (`requireRole`) is simple, auditable and cheap, and it answers "may this *kind* of user call this endpoint?". RBAC alone is not enough, though, so it is paired with **object-level** checks (next answers).

### Why controllers and services?
Separation by responsibility:

| Layer | Responsibility |
|---|---|
| Routes | Wiring only: method, path, authentication, role |
| Controllers | HTTP: which inputs are accepted (validated), which status code and headers to return |
| Services | Business rules and authorisation; know nothing about HTTP |
| Repositories | All database queries |

Practical wins:
- Services can be tested without HTTP.
- The AI matcher reuses the application service's access rule instead of copying it.
- Queries and their indexes live together.
- Changing the response format meant touching one file (`http/controller.ts`), not 60 routes.

### Why validation?
The server cannot trust anything a client sends, whether that is the browser, a script or an attacker. Every body, query and path parameter is validated with zod **before** business logic runs (`http/controller.ts#validateInput`):
- It rejects malformed ids, out-of-range numbers, unknown enum values and oversized strings.
- It strips unknown fields, which blocks mass assignment (you cannot send `role: "ADMIN"`).
- It reports every problem at once, with the field name.

The schemas live in `packages/shared`, so the React forms validate with the same rules. Mongoose schema validators are a second line of defence.

### Why centralised error handling?
One function (`http/middleware/errorHandler.ts`) turns every error into a response. That guarantees three things:
1. **Consistency.** Every failure has the same shape (`{success:false, error:{code, message, details, requestId}}`) and a correct status code.
2. **Safety.** Unexpected errors are logged with a request id and answered with a generic 500. Stack traces, database messages and connection strings never reach the client (a test forces a 500 to prove this).
3. **Translation.** Library errors become domain errors: a Mongo duplicate-key error becomes 409 `DUPLICATE_APPLICATION` or `EMAIL_TAKEN`; a multer size error becomes 413.

Services simply `throw new ConflictError(...)` and never format responses.

### How does authentication work?
1. Register or log in. The password is checked with bcrypt; an unknown email takes the same time and gets the same answer as a wrong password.
2. The server returns a 15-minute **access token** (a JWT with `sub` = user id and `role`) and sets a **refresh token**: 256 random bits, stored only as a SHA-256 hash, in an `httpOnly; SameSite=Strict` cookie. A native app can ask for it in the body instead.
3. Each request sends `Authorization: Bearer <access token>`. The `authenticate` middleware verifies signature, algorithm, issuer, audience and expiry, then checks the account is still active and the token was issued after any revocation. Both results are cached for 30 seconds.
4. When the access token expires, the client calls `/auth/refresh`. The old refresh token is marked used and a new one issued. If a used token is presented again, that indicates theft, and the whole session family is revoked.
5. Logout revokes the family. Password change or deactivation revokes every session and outstanding access tokens.

### How does authorisation work?
Two layers:
- **Roles**, checked in the router (`requireRole`), answer 403.
- **Ownership**, checked in services through `policies/access.ts`:
  - a recruiter may change a job only if it belongs to *their company*;
  - an application is visible only to its applicant, the hiring company's recruiters and admins;
  - a resume can be downloaded by its owner, an admin, or a recruiter whose company received *that exact resume*.

Private objects answer **404** (not 403) to anyone else, so changing an id in the URL (IDOR/BOLA) reveals nothing. Ownership is never taken from the request body: the company of a new job, the applicant of an application and the owner of an upload all come from the verified token. Collection endpoints put the caller's scope inside the database query (`GET /applications` is filtered by applicant or company first), so query filters can only narrow what you see.

### How are MongoDB relationships represented?
By **references** (ObjectIds) where the related document has its own lifecycle:

| Reference | Meaning |
|---|---|
| `Job.company` | Company → Jobs |
| `Application.job`, `Application.applicant` | Job → Applications, User → Applications |
| `Application.resume` | Application → Resume |
| `RecruiterProfile.company` | Recruiter → Company |
| `JobSeekerProfile.resume` | Seeker → current Resume |

By **embedding** where data is always read with its parent and is bounded: education, experience, status history, notes.

Some display fields are **snapshotted** (a job's company name; an application's job title and applicant name) so lists need no joins. Those snapshots are updated in the same transaction when the source changes. Integrity that a relational database gives with foreign keys is provided by:
- unique indexes: one application per (job, applicant), one company per recruiter, unique email;
- explicit, transactional cascades for deletes;
- Mongoose validators.

### How does pagination work?
Every collection accepts `page` (default 1) and `limit` (default 20, **max 100**, so there are no unbounded queries) and returns `meta: { page, limit, total, totalPages, hasNextPage }`. Every sort includes `_id` as a tie-breaker and is backed by an index, so pages are stable and MongoDB never sorts in memory.

The job search also supports **keyset cursors**: `meta.nextCursor` encodes the last row's sort value and `_id`, and the next query asks for rows "after" it. The cost is the same at page 1 or page 1000 (no `skip`), and new jobs arriving meanwhile do not shift pages. Cursors are tied to their sort order; a mismatched or tampered cursor is rejected with 422. (`utils/cursor.ts`, `repositories/job.repository.ts#search`)

### How does filtering work?
Query parameters are validated into a typed object, then `buildSearchFilter` builds one MongoDB filter where every clause combines with AND:

| Parameter | How it is matched |
|---|---|
| `title` | every word must be in the title's token array (`titleTokens`, `$all`) |
| `location` | anchored, case-insensitive prefix on a lower-cased copy (`locationLower`; user input is regex-escaped) |
| `skills` | any listed skill (`requiredSkillsLower`, `$in`) |
| `experience` | the candidate's years: `experienceRequired ≤ N` |
| `employmentType` | one or several types (`$in`) |
| salary, date, company | minimum top salary, posted within N days, one company |

Every clause is served by a compound index that starts with `status` and ends with the sort key, which is why the lower-cased "mirror" fields exist: case-insensitive search that still uses an index. Invalid filters are rejected (422), never silently ignored.

### How are resumes secured?
- **Upload.** Multipart with exactly one part, max 5 MB, held in memory. The file type is detected from its **bytes** (PDF header, DOCX zip containing `word/document.xml`, DOC OLE2 header) and must match the extension. The client's Content-Type is ignored. Macro-enabled documents are rejected. The filename is sanitised (no paths or control characters; length capped). A SHA-256 hash is recorded.
- **Storage.** Private GridFS bucket, addressed by an internal id that is never sent to clients. Uploads are immutable, and an application points at the exact file that was sent.
- **Download.** Only after `assertCanReadResume`: owner, admin, or a recruiter whose company received that resume. Everyone else gets 404. Responses are `attachment` with `no-store`, `nosniff` and a sandbox CSP, so the browser never renders them as active content.
- **Deletion.** Removing a resume that applications used keeps the bytes for those recruiters (archived); otherwise the file and its metadata are deleted.

(`http/middleware/upload.ts`, `utils/fileInspection.ts`, `modules/resumes`, `policies/access.ts`)

### How does the application workflow work?
A fixed transition table (`packages/shared/src/status.ts`), shared by the server and the recruiter board:

```
APPLIED → SHORTLISTED → INTERVIEW → SELECTED
   └──────────┴────────────┴──→ REJECTED
```

SELECTED and REJECTED are final. `PATCH /applications/:id {status}`:
1. Loads the application (404 if you may not see it).
2. Requires the hiring company or an admin (the applicant gets 403).
3. Checks that the transition is allowed (409 `INVALID_STATUS_TRANSITION`).
4. Applies it with a **conditional update** that only succeeds if the status is still what was read, so two recruiters acting at once cannot both win (409 `CONCURRENT_UPDATE`).
5. Appends `{status, changedBy, changedAt}` to the history and notifies the applicant through a domain event.

Applying is protected too: the job must be open, a resume must exist, and a unique index guarantees one application per job even under concurrent requests.

### How does the AI feature work?
"Analyse my fit" (seeker, `POST /jobs/:id/match`) and "Analyse fit" (recruiter, `POST /applications/:id/match`):
1. **Authorisation first**, through the same policies as the rest of the API. The recruiter version uses the resume that was actually sent.
2. **Inputs** gathered through repositories: job requirements, profile, and the resume (a PDF goes to the model as a document; DOCX text was extracted at upload).
3. **Cache check**, keyed by a fingerprint of the inputs.
4. **The model call** (`modules/matching/provider.ts`, the only file that knows about Anthropic):
   - model `claude-opus-5` by default;
   - output constrained by a JSON schema;
   - a timeout and one retry;
   - server-side fallback if the model declines.
   The answer is **re-validated with zod** because a schema constrains output but does not guarantee it.
5. **Any failure** (no key, timeout, rate limit, refusal, truncation, invalid output) makes a deterministic, explainable heuristic answer instead: skill overlap 70% plus experience 30%. The response says `engine: "heuristic"` and why.
6. **Guard rails.** The key stays on the server; each user gets 30 analyses per hour; the prompt treats resume text as untrusted data and excludes protected characteristics; the result is advice only and changes nothing in the workflow.

---

### Likely follow-up questions

**Why 404 instead of 403 for other people's applications?** A 403 confirms the id exists. Returning 404 makes a private object indistinguishable from a missing one, so ids cannot be enumerated.

**What stops two identical applications?** An application-level check would race, so the database enforces it: a unique index on `{job, applicant}`. The duplicate-key error is mapped to 409 `DUPLICATE_APPLICATION`. A test fires five concurrent submissions and expects exactly one 201.

**Why can't recruiters delete a job with applicants?** It would destroy candidates' application history. They close it instead (`PATCH status=CLOSED`). Admins can still remove fraudulent postings.

**Why snapshots instead of `$lookup`?** Lists are read far more often than names change. Snapshots make each list a single indexed query; the rare rename pays one `updateMany` inside the same transaction.

**How do you know the documentation is accurate?** The OpenAPI spec is generated from the same route table the tests check against the live routers (`tests/contract.test.ts`). An undocumented route, or a documented route that doesn't exist, fails the build. The same test proves every protected route rejects anonymous calls.

**How would this scale?** API workers are stateless (JWT), one per core, and more can be added behind a load balancer. Cross-worker state lives in MongoDB (rate-limit counters, change streams for cache invalidation). The next steps would be Redis for the global limiter and caches, Atlas Search for relevance-ranked search, and object storage (S3) plus virus scanning for resumes.

**How is it tested?** 186 API tests against a real MongoDB replica set: authentication attacks, the IDOR matrix, file spoofing, workflow races, rate limits, the AI adapter with a mocked SDK and every failure mode, and the documentation contract. Also Playwright end-to-end journeys with accessibility scans on the production build, and a load-test harness with regression budgets.
