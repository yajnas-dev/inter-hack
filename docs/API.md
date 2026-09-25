# Job Portal API — v1 reference

This is the reference for the REST API the React client uses. Any other client (mobile, CLI, another service) can use it the same way.

- **Base URL:** `/api/v1` (for example `http://localhost:5000/api/v1`).
- **Machine-readable spec:** `GET /api/v1/openapi.json` (OpenAPI 3.0). Interactive docs: `GET /api/v1/docs`. Both are on by default outside production; set `ENABLE_DOCS=true` to expose them in production.
- The OpenAPI document is built from the same route list the server mounts. `server/tests/contract.test.ts` fails if a route exists without documentation, or documentation exists without a route.

---

## 1. Conventions

### Envelope

Every JSON response has the same shape.

```jsonc
// success
{ "success": true, "data": { ... } }                      // one resource
{ "success": true, "data": [ ... ], "meta": { ... } }     // a collection (meta = paging)
{ "success": true, "data": { ... }, "message": "Job created" }

// failure
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",                // stable, machine-readable: branch on this
    "message": "Request validation failed",    // human-readable
    "details": [                               // present for field-level problems
      { "location": "body", "field": "salaryMax", "message": "salaryMax must be greater than or equal to salaryMin" }
    ],
    "requestId": "0b6f3c1e-…"                  // same as the X-Request-Id header; quote it when reporting a problem
  }
}
```

A `204 No Content` response has no body. File downloads (`GET /resumes/:id/file`) send the file's bytes, not JSON.

### Status codes

| Status | When |
|---|---|
| 200 | Read or update succeeded |
| 201 | Resource created; the `Location` header gives its URL |
| 204 | Succeeded, no body (deletes, logout, password change, bookmarks) |
| 304 | Public job reads only: your `If-None-Match` ETag is still current |
| 400 | Malformed request: invalid JSON, broken multipart body, wrong upload field |
| 401 | No valid credentials (see the codes below) |
| 403 | Authenticated, but the role or ownership check failed |
| 404 | Not found, **or a private resource you may not see** (applications, resumes, notes), so ids cannot be probed |
| 409 | Conflicts with current state (duplicate, invalid transition, closed job, …) |
| 413 | Body or file too large (JSON 100 KB, resume 5 MB) |
| 415 | Wrong media type: body not JSON, or a file that is not a real PDF/DOC/DOCX |
| 422 | Validation failed, or a precondition is missing (no company, no resume) |
| 429 | Rate limited; wait `Retry-After` seconds |
| 500 | Unexpected server error. No internals are returned; the details are logged under `requestId` |
| 503 | A dependency (the database) is unavailable |

### Error codes

| Code | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed JSON or multipart |
| `UNAUTHENTICATED` | 401 | No `Authorization` header |
| `INVALID_TOKEN` | 401 | Bad signature, algorithm, issuer or audience, or not a JWT |
| `TOKEN_EXPIRED` | 401 | Access token expired or revoked; call `/auth/refresh` |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password (the same answer for both) |
| `SESSION_EXPIRED` | 401 | Refresh token missing, expired, rotated or revoked |
| `ACCOUNT_DISABLED` | 401 / 403 | Account deactivated (401 for tokens, 403 on login) |
| `FORBIDDEN` | 403 | Role not allowed, or not your company's resource |
| `CSRF_CHECK_FAILED` | 403 | Cookie-based refresh/logout without `X-Requested-With` |
| `NOT_FOUND` / `ROUTE_NOT_FOUND` | 404 | Unknown resource / unknown URL |
| `EMAIL_TAKEN` | 409 | Registration with an email that already exists |
| `COMPANY_EXISTS` | 409 | A recruiter may register only one company |
| `DUPLICATE_APPLICATION` | 409 | Already applied to this job |
| `JOB_CLOSED` | 409 | The job is not accepting applications |
| `JOB_HAS_APPLICATIONS` | 409 | A recruiter cannot delete a job with applicants; close it instead |
| `INVALID_STATUS_TRANSITION` | 409 | The requested status is not a valid next step |
| `CONCURRENT_UPDATE` | 409 | Someone changed the application first; reload and retry |
| `PAYLOAD_TOO_LARGE` | 413 | |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | |
| `VALIDATION_ERROR` | 422 | See `details` |
| `COMPANY_REQUIRED` | 422 | The recruiter must register a company first |
| `RESUME_REQUIRED` | 422 | The seeker must upload a resume before applying |
| `PROFILE_INCOMPLETE` | 422 | A match analysis needs a resume, or skills or experience on the profile |
| `RATE_LIMITED` | 429 | |
| `INTERNAL_ERROR` | 500 | |
| `SERVICE_UNAVAILABLE` | 503 | |

### Validation rules

- Every body, query parameter and path parameter is validated before any business logic runs. All problems are reported in one response, with one `details` entry per field.
- Cross-field rules (for example `salaryMax ≥ salaryMin`) are checked once each field is individually valid.
- **Unknown body and query keys are ignored.** You cannot set fields the API does not accept, such as `role`, `isActive`, `status` on create, or `company` on a job. The query parser accepts only flat strings, so `?role[$ne]=x` is not an operator.
- An empty query parameter (`?title=`) means "not provided". An invalid one (`?limit=abc`, `?sort=name`) is rejected with 422, never silently corrected.
- Ids are 24-character hex strings. A malformed id is a 422 on `params.id`.

### Pagination

- **Page numbers** (every collection): `page` (1-based, default 1, maximum 1000) and `limit` (default 20, maximum **100**). Collections return:
  `meta: { page, limit, total, totalPages, hasNextPage }`.
- **Keyset cursor** (`GET /jobs`): pass `meta.nextCursor` back as `cursor`. The cost is the same at any depth, and rows inserted while you page do not shift the pages. A cursor is tied to the sort it was produced for; using it with a different `sort` returns 422. Cursor pages omit `total`.

### Authentication

1. `POST /auth/register` or `POST /auth/login` returns `data.accessToken`, a JWT valid for 15 minutes (`expiresIn`, in seconds).
2. Send it on every protected call: `Authorization: Bearer <accessToken>`.
3. When it expires (`401 TOKEN_EXPIRED`), call `POST /auth/refresh` to get a new one.

The refresh token can travel in one of two ways:

| Client | How it receives the refresh token | How it refreshes |
|---|---|---|
| Browser (default) | `jp_refresh` cookie: `HttpOnly; SameSite=Strict; Path=/api/v1/auth` (plus `Secure` in production) | `POST /auth/refresh` with the header `X-Requested-With: <anything>` |
| Native or mobile | Send `X-Token-Transport: body` on register/login/refresh; `data.refreshToken` is returned in the JSON | `POST /auth/refresh` with body `{ "refreshToken": "…" }` |

Each refresh token works **once**: every refresh issues a new one. Presenting an already-used token more than 10 seconds after it was used is treated as theft, and every session descended from that login is revoked. Logging out revokes the session server-side. Changing the password or being deactivated also revokes all sessions, including outstanding access tokens.

### Roles and ownership

| Role | Can |
|---|---|
| anonymous | Read jobs, facets, similar jobs and company profiles; register; log in |
| `JOB_SEEKER` | Profile, resumes, bookmarks, apply, their own applications, AI fit for a job |
| `RECRUITER` | One company; jobs **of that company**; its applicants, notes and status changes; AI fit for its applications |
| `ADMIN` | Everything under `/admin` and `/reports`; read any application or resume; review applications. Admins are created by `npm run seed:admin`, never by registration |

Ownership is object-level. Recruiters act on a job only if it belongs to **their company**. Seekers see only their own applications. A resume can be read by its owner, by an admin, or by a recruiter whose company **received that exact resume** in an application.

### Headers

| Header | Direction | Purpose |
|---|---|---|
| `X-Request-Id` | both | Correlation id: echoed back (or generated) and included in error bodies |
| `Location` | response | URL of a newly created resource (201) |
| `ETag` / `If-None-Match` | both | Public job reads: 304 when unchanged |
| `RateLimit`, `RateLimit-Policy`, `Retry-After` | response | Rate-limit state (IETF draft-7 format) |
| `Cache-Control` | response | `no-store` on everything private; `public, max-age=10` on anonymous job reads |

### Rate limits

| Scope | Limit (default) | Key |
|---|---|---|
| Whole API | 300 requests / minute | client IP, per worker process |
| `POST /auth/login`, `POST /auth/register` | 20 / 15 minutes | client IP, shared by all workers (stored in MongoDB) |
| AI match endpoints | 30 / hour | user id, shared by all workers |

---

## 2. Endpoints

Legend: 🔓 public · 🔑 any signed-in user · role names = required role.

### Health

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | 🔓 | `{ status: "ok", uptimeSeconds }` |
| GET | `/health/ready` | 🔓 | 200 `{ status: "ready" }` or 503 when the database is down |

### Auth — `/auth`

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, role: "JOB_SEEKER" \| "RECRUITER" }` | 201 `AuthSession` | 409 `EMAIL_TAKEN`, 422, 429 |
| POST | `/auth/login` | `{ email, password }` | 200 `AuthSession` | 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_DISABLED`, 429 |
| POST | `/auth/refresh` | `{ refreshToken? }` | 200 `AuthSession` | 401 `SESSION_EXPIRED`, 403 `CSRF_CHECK_FAILED` |
| POST | `/auth/logout` | `{ refreshToken? }` | 204 | |

Password rules: 8–72 bytes, with at least one letter and one number (bcrypt ignores anything past 72 bytes, so longer passwords are rejected rather than silently truncated).

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "sam@example.com", "password": "password123" }
```
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": { "id": "66f1…", "name": "Sam", "email": "sam@example.com", "role": "JOB_SEEKER", "isActive": true, "createdAt": "2026-09-25T10:00:00.000Z" }
  }
}
```

### Current user — `/users/me`

| Method | Path | Role | Body / query | Success |
|---|---|---|---|---|
| GET | `/users/me` | 🔑 | | `User` |
| PATCH | `/users/me` | 🔑 | `{ name }` | `User` |
| PUT | `/users/me/password` | 🔑 | `{ currentPassword, newPassword }` | 204 (all sessions revoked); 401 if the current password is wrong |
| GET | `/users/me/profile` | 🔑 | | `SeekerProfile` \| `RecruiterProfile` \| `{ user, role: "ADMIN" }` |
| PATCH | `/users/me/profile` | seeker, recruiter | seeker: `{ headline?, phone?, address?, dateOfBirth?, totalExperienceYears?, skills?, education?, experience? }` · recruiter: `{ designation?, phone? }` | the updated profile |
| GET | `/users/me/jobs` | RECRUITER | `?status=OPEN\|CLOSED&page&limit` | `ManagedJob[]` (with `applicantCount`) |
| GET | `/users/me/dashboard` | RECRUITER | | open/closed jobs, applicants by stage, new this week, recent, stale (3+ days in APPLIED) |
| GET | `/users/me/saved-jobs` | JOB_SEEKER | `?page&limit` | `JobListItem[]` |
| GET | `/users/me/saved-jobs/ids` | JOB_SEEKER | | `string[]` |
| PUT | `/users/me/saved-jobs/:jobId` | JOB_SEEKER | | 204 (idempotent); 404 unknown job |
| DELETE | `/users/me/saved-jobs/:jobId` | JOB_SEEKER | | 204 (idempotent) |

The profile's `resume` is the **current** resume (the one new applications use). The profile never includes storage ids or file hashes.

### Companies — `/companies`

| Method | Path | Role | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/companies` | RECRUITER | `{ name, description?, website?, industry?, location?, logoUrl? }` | 201 `Company` | 409 `COMPANY_EXISTS` |
| GET | `/companies/:id` | 🔓 | | `Company` | 404 |
| PATCH | `/companies/:id` | RECRUITER (own company) | any subset of the create fields | `Company` | 403, 404 |

`website` and `logoUrl` must be `http(s)` URLs. A `javascript:` URL is rejected, because it would become a script link wherever it is displayed. Renaming a company updates the name shown on its jobs and applications in the same transaction.

### Jobs — `/jobs`

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/jobs` | 🔓 | Search open jobs (below) |
| GET | `/jobs/facets` | 🔓 | Counts by location, skill and employment type (filter options) |
| GET | `/jobs/:id` | 🔓 | `JobDetail` with the full company. Closed jobs stay readable |
| GET | `/jobs/:id/similar` | 🔓 | Up to 4 open jobs at the same company or sharing a skill |
| POST | `/jobs` | RECRUITER | Creates a job under the caller's company. 201 `ManagedJob`; 422 `COMPANY_REQUIRED` |
| PATCH | `/jobs/:id` | RECRUITER (own company) | Any subset of fields, plus `status: "OPEN" \| "CLOSED"` to close or reopen. 403 for another company's job |
| DELETE | `/jobs/:id` | RECRUITER (own company) | 204, or 409 `JOB_HAS_APPLICATIONS` (candidates' history is kept) |
| GET | `/jobs/:jobId/applications` | RECRUITER (own company), ADMIN | Applicants, `?status=&page&limit`, each with `matchCount / matchTotal` |
| POST | `/jobs/:jobId/match` | JOB_SEEKER | AI fit analysis, see §3 |

**Job fields (create).** `title`, `description`, `location` (required text); `salaryMin`, `salaryMax` (≥ 0, `salaryMax ≥ salaryMin`); `requiredSkills` (≤ 30, de-duplicated case-insensitively); `experienceRequired` (0–60 years); `employmentType` (`FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `REMOTE`); `vacancies` (optional, ≥ 1). New jobs are always `OPEN`.

**Search parameters (`GET /jobs`).** All filters combine with AND.

| Param | Example | Meaning |
|---|---|---|
| `title` | `backend engineer` | Every word must appear in the title (case-insensitive) |
| `location` | `chen` | Case-insensitive **prefix** of the location |
| `skills` | `React,Node.js` | Requires **any** of the listed skills (case-insensitive, ≤ 20) |
| `experience` | `3` | The candidate's years: jobs requiring **at most** 3 years |
| `employmentType` | `FULL_TIME,REMOTE` | One or more types |
| `minSalary` | `500000` | Jobs whose top salary is at least this |
| `postedWithin` | `7` | Posted in the last 1, 3, 7, 14 or 30 days |
| `company` | `66f1…` | One company's jobs |
| `sort` | `-createdAt` | `-createdAt` (default), `createdAt`, `-salaryMax`, `salaryMax` |
| `page`, `limit`, `cursor` | | See Pagination |

```http
GET /api/v1/jobs?location=Chennai&skills=React,Node.js&employmentType=FULL_TIME&sort=-salaryMax&limit=20
```
```json
{
  "success": true,
  "data": [
    {
      "id": "66f1…",
      "title": "Senior Backend Engineer",
      "company": { "id": "66f0…", "name": "Northwind Labs" },
      "location": "Chennai",
      "salaryMin": 1200000,
      "salaryMax": 2400000,
      "requiredSkills": ["Node.js", "MongoDB"],
      "experienceRequired": 5,
      "employmentType": "FULL_TIME",
      "status": "OPEN",
      "vacancies": 2,
      "createdAt": "2026-09-25T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "nextCursor": null }
}
```

Anonymous job reads are served from a 10-second, pre-serialised cache with ETags. Any job change on any worker invalidates it immediately.

### Applications — `/applications`

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/applications` | JOB_SEEKER | `{ jobId, coverNote? }`. 201; 409 `DUPLICATE_APPLICATION` / `JOB_CLOSED`; 422 `RESUME_REQUIRED` |
| GET | `/applications` | 🔑 | Caller-scoped: a seeker's own, a recruiter's company's, or all (admin). `?status=&jobId=&page&limit` |
| GET | `/applications/:id` | 🔑 | Includes `statusHistory`. 404 for anyone who may not see it |
| PATCH | `/applications/:id` | RECRUITER (hiring company), ADMIN | `{ status }`: a workflow move (§4). 409 `INVALID_STATUS_TRANSITION` / `CONCURRENT_UPDATE` |
| GET | `/applications/:id/applicant` | RECRUITER (hiring company), ADMIN | The applicant's profile |
| GET | `/applications/:id/notes` | RECRUITER (hiring company), ADMIN | Private notes, newest first |
| POST | `/applications/:id/notes` | RECRUITER (hiring company), ADMIN | `{ text }` → 201 `Note` |
| POST | `/applications/:id/match` | RECRUITER (hiring company), ADMIN | AI fit, using the resume that was sent (§3) |

An application records the **resume that was sent**. If the seeker later uploads a new resume, the application still points to the old one. Reviewer views also include `allowedNextStatuses`.

```http
PATCH /api/v1/applications/66f1…
Authorization: Bearer …
Content-Type: application/json

{ "status": "SHORTLISTED" }
```
```json
{
  "success": true,
  "data": {
    "id": "66f1…",
    "status": "SHORTLISTED",
    "allowedNextStatuses": ["INTERVIEW", "REJECTED"],
    "statusHistory": [
      { "status": "APPLIED", "changedAt": "…", "changedBy": "…" },
      { "status": "SHORTLISTED", "changedAt": "…", "changedBy": "…" }
    ]
  }
}
```

### Resumes — `/resumes`

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/resumes` | JOB_SEEKER | `multipart/form-data` with exactly one part named `file`. 201 `Resume`, which becomes the current resume |
| GET | `/resumes` | JOB_SEEKER | Own resumes (current one flagged `isCurrent`) |
| GET | `/resumes/:id` | 🔑 (authorised readers) | Metadata |
| GET | `/resumes/:id/file` | 🔑 (authorised readers) | The file, as an attachment |
| DELETE | `/resumes/:id` | JOB_SEEKER (owner) | 204. If applications used it, it is kept for those recruiters and hidden from the owner's list |

Upload checks, in order:

| Check | Response |
|---|---|
| Body is `multipart/form-data` | else 415 |
| Exactly one part, named `file`, no other fields | else 400 |
| At most 5 MB | else 413 |
| Extension is `.pdf`, `.docx` or `.doc` | else 415 |
| The bytes are really that format (PDF header, DOCX zip containing `word/document.xml`, DOC OLE2 header), matching the extension | else 415 |
| Not a macro-enabled Word document | else 415 |
| Not empty | else 422 |

The client's `Content-Type` is ignored; the stored type is the detected one. The filename is sanitised: path components, control characters and reserved characters are removed, and the length is capped. Downloads carry `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and a sandbox CSP.

Replacing a resume deletes the previous file, unless an application references it.

### Notifications — `/notifications`

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | 🔑 own notifications, `?limit (≤50)&unreadOnly=true`; `meta.unread` |
| GET | `/notifications/unread-count` | 🔑 `{ unread }` |
| PATCH | `/notifications` | 🔑 `{ ids: [...] }` or `{ all: true }` marks read → `{ unread }` |

Notifications are created from domain events: a new application notifies the recruiter who posted the job, and a status change notifies the applicant.

### Admin — `/admin` (ADMIN only)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users` | `?role=&isActive=&q=` (name/email prefix) `&page&limit` |
| GET | `/admin/users/:id` | |
| PATCH | `/admin/users/:id` | `{ isActive }`. Deactivation revokes every session immediately. Admins cannot deactivate themselves (403) |
| DELETE | `/admin/users/:id` | 204. Removes the user and everything they own: company, its jobs and their applications, the user's applications, resumes (bytes too), sessions, bookmarks, notifications |
| GET | `/admin/companies` | `?q=` (name prefix); each row has `openJobs` |
| DELETE | `/admin/companies/:id` | 204. Removes the company's jobs and their applications, and detaches its recruiters |
| GET | `/admin/jobs` | Any status, `?status=&company=&q=`; rows include `applicantCount` and `postedBy` |
| PATCH | `/admin/jobs/:id` | `{ status }`: moderation (close or reopen) |
| DELETE | `/admin/jobs/:id` | 204, including when the job has applications |
| GET | `/admin/applications` | `?status=&jobId=&company=` |

### Reports — `/reports` (ADMIN only)

| Method | Path | Returns |
|---|---|---|
| GET | `/reports/summary` | Users by role (and active), companies, jobs open/closed, applications total and by status |
| GET | `/reports/applications-over-time` | `?days=1..365` (default 90): `[{ date: "YYYY-MM-DD", count }]` |
| GET | `/reports/top-jobs` | Top 10 jobs by applicants |
| GET | `/reports/top-companies` | Top 10 companies by applicants |

Reports are cached for 60 seconds; admin changes clear the cache.

---

## 3. AI match analysis

`POST /jobs/:jobId/match` (seeker: *my* fit) and `POST /applications/:id/match` (hiring company: *this applicant's* fit) return the same structure:

```json
{
  "success": true,
  "data": {
    "jobId": "66f1…",
    "engine": "ai",
    "model": "claude-opus-5",
    "score": 72,
    "verdict": "GOOD",
    "summary": "Solid Node.js API experience; no MongoDB evidence.",
    "matchedSkills": ["Node.js"],
    "missingSkills": ["MongoDB"],
    "strengths": ["Four years building REST APIs in Node.js"],
    "gaps": ["No document-database experience shown"],
    "suggestions": ["Describe any MongoDB or other NoSQL work"],
    "experience": { "requiredYears": 3, "candidateYears": 4 },
    "warnings": [],
    "generatedAt": "2026-09-25T10:00:00.000Z",
    "cached": false
  }
}
```

- `verdict` is derived from `score`: ≥ 80 `STRONG`, ≥ 60 `GOOD`, ≥ 40 `PARTIAL`, otherwise `WEAK`.
- `engine: "heuristic"` means a rule-based estimate was returned: skill overlap and experience, weighted 70/30. This happens when no AI key is configured, or when the model times out, is rate limited, refuses, or returns unusable output. `warnings[0]` says which. These failures still return **200**, because the caller gets a useful answer.
- Inputs: the job, the candidate's profile, and the resume (a PDF is sent to the model as a document; DOCX text is extracted at upload; legacy `.doc` resumes are not readable, and `warnings` says so).
- AI results are cached per (job, candidate, inputs) for up to 7 days. Editing the job, the profile or the resume produces a fresh analysis.
- Limited to 30 calls per user per hour (429 after that).

---

## 4. Application status workflow

```
APPLIED ──► SHORTLISTED ──► INTERVIEW ──► SELECTED
   │             │              │
   └─────────────┴──────────────┴──────► REJECTED
```

| From | Allowed next |
|---|---|
| APPLIED | SHORTLISTED, REJECTED |
| SHORTLISTED | INTERVIEW, REJECTED |
| INTERVIEW | SELECTED, REJECTED |
| SELECTED | *(final)* |
| REJECTED | *(final)* |

- Only the hiring company's recruiters (or an admin) may move an application; the applicant cannot (403).
- The move is a conditional update (`status` must still be the value the reviewer saw), so two reviewers cannot both win. The loser gets 409 `CONCURRENT_UPDATE`.
- Every move is appended to `statusHistory` with who made it and when, and it notifies the applicant.
- The same table (`packages/shared/src/status.ts`) drives the API and the recruiter board, so the two cannot disagree.

---

## 5. Quick start with curl

```bash
API=http://localhost:5000/api/v1

# recruiter: register, create the company, post a job
TOKEN=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Rita","email":"rita@example.com","password":"password123","role":"RECRUITER"}' | jq -r .data.accessToken)
curl -s -X POST $API/companies -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Northwind Labs"}'
curl -s -X POST $API/jobs -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "title":"Backend Engineer","description":"Build APIs","location":"Chennai","salaryMin":800000,"salaryMax":1400000,
  "experienceRequired":3,"employmentType":"FULL_TIME","requiredSkills":["Node.js","MongoDB"]}'

# seeker: register, upload a resume, search, apply
SEEKER=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Sam","email":"sam@example.com","password":"password123","role":"JOB_SEEKER"}' | jq -r .data.accessToken)
curl -s -X POST $API/resumes -H "Authorization: Bearer $SEEKER" -F "file=@resume.pdf"
JOB=$(curl -s "$API/jobs?location=chen&skills=node.js" | jq -r '.data[0].id')
curl -s -X POST $API/applications -H "Authorization: Bearer $SEEKER" -H 'Content-Type: application/json' -d "{\"jobId\":\"$JOB\"}"
curl -s -X POST $API/jobs/$JOB/match -H "Authorization: Bearer $SEEKER"
```
