// Rate limiting is off in the rest of the suite; this file turns it on with tiny limits. vi.hoisted runs before
// the imports below, so the settings are in place when the app's configuration loads (each test file runs in its
// own process, so they do not leak into other files).
vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = 'true';
  process.env.AUTH_RATE_LIMIT = '3';
  process.env.AI_RATE_LIMIT_PER_HOUR = '2';
});

import { API, PASSWORD, app, auth, createJob, recruiterWithCompany, request, seeker } from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

test('login attempts beyond the limit -> 429 RATE_LIMITED with Retry-After', async () => {
  const attempt = () => request(app).post(`${API}/auth/login`).send({ email: 'x@example.com', password: PASSWORD });
  for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
  const limited = await attempt();
  expect(limited.status).toBe(429);
  expect(limited.body.error.code).toBe('RATE_LIMITED');
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  expect(limited.headers.ratelimit).toBeDefined();
});

test('the AI endpoint is limited per user', async () => {
  // Registration shares the auth limit, so clear the counters first.
  await clearDatabase();
  const r = await recruiterWithCompany();
  const job = await createJob(r.token);
  const s = await seeker();
  await request(app)
    .patch(`${API}/users/me/profile`)
    .set(auth(s.token))
    .send({ skills: ['JavaScript'] });

  const match = () => request(app).post(`${API}/jobs/${job.id}/match`).set(auth(s.token));
  expect((await match()).status).toBe(200);
  expect((await match()).status).toBe(200);
  expect((await match()).status).toBe(429);
});
