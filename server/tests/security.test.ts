import { Company } from '../src/models';
import { API, adminToken, app, auth, createJob, recruiterWithCompany, register, request, seekerWithResume } from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(async () => {
  vi.restoreAllMocks();
  await clearDatabase();
});
afterAll(closeDatabase);

describe('transport and headers', () => {
  test('security headers are set and the framework is not advertised', async () => {
    const res = await request(app).get(`${API}/health`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('every response carries a request id; a sane incoming one is honoured and echoed in errors', async () => {
    const res = await request(app).get(`${API}/nope`).set('X-Request-Id', 'trace-123');
    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.body.error.requestId).toBe('trace-123');
  });

  test('private API responses are never cached; public job reads support ETag / 304', async () => {
    const u = await register();
    expect((await request(app).get(`${API}/users/me`).set(auth(u.token))).headers['cache-control']).toBe('no-store');
    const list = await request(app).get(`${API}/jobs`);
    expect(list.headers.etag).toMatch(/^W\//);
    expect((await request(app).get(`${API}/jobs`).set('If-None-Match', list.headers.etag)).status).toBe(304);
  });

  test('the public cache marks responses public only when caching is enabled (it is disabled under test)', async () => {
    const express = (await import('express')).default;
    const { createJsonCache } = await import('../src/infra/cache/json');
    const cache = createJsonCache(1000);
    const mini = express().get('/x', (req, res) => void cache.respond(req, res, 'x', async () => ({ success: true, data: 1 })));
    expect((await request(mini).get('/x')).headers['cache-control']).toBe('public, max-age=10, stale-while-revalidate=30');
  });

  test('CORS allows only the configured origin', async () => {
    const allowed = await request(app).get(`${API}/health`).set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get(`${API}/health`).set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request hygiene', () => {
  test('JSON bodies over 100 KB -> 413', async () => {
    const res = await request(app)
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(120_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('malformed JSON -> 400; non-JSON body -> 415', async () => {
    const bad = await request(app).post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    const form = await request(app).post(`${API}/auth/login`).type('form').send('email=a@b.co&password=x');
    expect(form.status).toBe(415);
  });

  test('unknown routes -> 404 ROUTE_NOT_FOUND; unversioned paths get a hint', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error.message).toMatch(/use \/api\/v1/);
  });

  test('unexpected failures -> 500 INTERNAL_ERROR with no internals in the body', async () => {
    const admin = await adminToken();
    vi.spyOn(Company, 'estimatedDocumentCount').mockImplementation(() => {
      throw new Error('connection string mongodb://user:secret@db/prod exploded');
    });
    const res = await request(app).get(`${API}/reports/summary`).set(auth(admin.token));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: expect.any(String) }
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|stack|mongodb/);
  });
});

describe('mass assignment', () => {
  test('registration ignores role escalation fields and stray flags', async () => {
    const u = await register({ isActive: false, _id: '0'.repeat(24) });
    const me = await request(app).get(`${API}/users/me`).set(auth(u.token));
    expect(me.body.data).toMatchObject({ isActive: true, role: 'JOB_SEEKER' });
    expect(me.body.data.id).not.toBe('0'.repeat(24));
  });

  test('profile and account updates cannot change ownership, role or the resume pointer', async () => {
    const victim = await seekerWithResume();
    const attacker = await seekerWithResume();
    await request(app)
      .patch(`${API}/users/me/profile`)
      .set(auth(attacker.token))
      .send({ user: victim.user.id, resume: victim.resumeId, headline: 'ok' })
      .expect(200);
    const profile = await request(app).get(`${API}/users/me/profile`).set(auth(attacker.token));
    expect(profile.body.data).toMatchObject({ user: attacker.user.id, headline: 'ok', resume: { id: attacker.resumeId } });

    await request(app).patch(`${API}/users/me`).set(auth(attacker.token)).send({ name: 'x', role: 'ADMIN', isActive: false });
    expect((await request(app).get(`${API}/users/me`).set(auth(attacker.token))).body.data).toMatchObject({
      role: 'JOB_SEEKER',
      isActive: true
    });
  });

  test('a new job is always OPEN and owned by the caller, whatever the body says', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token, { status: 'CLOSED', postedBy: '0'.repeat(24) });
    const detail = await request(app).get(`${API}/jobs/${job.id}`);
    expect(detail.body.data.status).toBe('OPEN');
    const { Job } = await import('../src/models');
    expect(String((await Job.findById(job.id).lean())!.postedBy)).toBe(r.user.id);
  });

  test("a recruiter cannot edit another company's profile, or register a second company", async () => {
    const a = await recruiterWithCompany('A');
    const b = await recruiterWithCompany('B');
    const res = await request(app).patch(`${API}/companies/${b.company.id}`).set(auth(a.token)).send({ name: 'Pwned' });
    expect(res.status).toBe(403);
    expect((await request(app).get(`${API}/companies/${b.company.id}`)).body.data.name).toBe('B');
    const second = await request(app).post(`${API}/companies`).set(auth(a.token)).send({ name: 'A2' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('COMPANY_EXISTS');
  });

  test('company URLs must be http(s): javascript: links are rejected', async () => {
    const r = await register({ role: 'RECRUITER' });
    const res = await request(app).post(`${API}/companies`).set(auth(r.token)).send({ name: 'X', website: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('website');
  });
});

describe('recruiter company edits', () => {
  test('renaming the company updates the name on its jobs', async () => {
    const r = await recruiterWithCompany('Old Name');
    const job = await createJob(r.token);
    await request(app).patch(`${API}/companies/${r.company.id}`).set(auth(r.token)).send({ name: 'New Name' }).expect(200);
    const list = await request(app).get(`${API}/jobs`);
    expect(list.body.data.find((j: { id: string }) => j.id === job.id).company.name).toBe('New Name');
  });
});
