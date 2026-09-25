import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, auth, createRecruiterWithCompany, adminToken } from './helpers';
import { RefreshToken } from '../src/models';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

const XHR = { 'X-Requested-With': 'fetch' };
const cookieOf = (res: { headers: Record<string, unknown> }): string => {
  const raw = ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
  return raw.find((c) => c.startsWith('jp_refresh=')) ?? '';
};
const cookiePair = (setCookie: string) => setCookie.split(';')[0]!;

async function registerSeeker(email = 'sess@example.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'Sess', email, password: 'password123', role: 'JOB_SEEKER' });
  return { res, cookie: cookiePair(cookieOf(res)) };
}

describe('sessions: short-lived access token + rotating httpOnly refresh cookie (FR-01 secure login/logout)', () => {
  test('login sets an httpOnly, SameSite=Lax refresh cookie scoped to /api/auth', async () => {
    const { res } = await registerSeeker();
    const setCookie = cookieOf(res);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api\/auth/i);
    expect(JSON.stringify(res.body)).not.toContain(cookiePair(setCookie).split('=')[1]!);
  });

  test('refresh issues a new access token and rotates the refresh token', async () => {
    const { cookie } = await registerSeeker();
    const res = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).status).toBe(200);

    const rotated = cookiePair(cookieOf(res));
    expect(rotated).not.toBe(cookie);
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', rotated)).status).toBe(200);
  });

  test('logout revokes the session server-side: the refresh token stops working', async () => {
    const { cookie } = await registerSeeker();
    const out = await request(app).post('/api/auth/logout').set(XHR).set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(cookieOf(out)).toMatch(/jp_refresh=;/);

    const after = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  test('reusing an already-rotated token (theft) revokes the whole family', async () => {
    const { cookie } = await registerSeeker();
    const first = await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie);
    const newest = cookiePair(cookieOf(first));

    // Age the rotated token past the concurrent-tab grace window, then replay it.
    await RefreshToken.updateMany({ revokedAt: { $exists: true } }, { $set: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie)).status).toBe(401);

    // The legitimate newest token was in the same family, so it is dead too.
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', newest)).status).toBe(401);
  });

  test('two tabs refreshing with the same token at once are not treated as theft', async () => {
    const { cookie } = await registerSeeker();
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie)
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  test('refresh and logout require the X-Requested-With header (blocks cross-site form posts)', async () => {
    const { cookie } = await registerSeeker();
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(400);
  });

  test('refresh without a cookie, or with garbage, is 401', async () => {
    expect((await request(app).post('/api/auth/refresh').set(XHR)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', 'jp_refresh=garbage')).status).toBe(401);
  });

  test('deactivating a user kills their refresh sessions immediately', async () => {
    const admin = await adminToken();
    const { res, cookie } = await registerSeeker('victim@example.com');

    await request(app).patch(`/api/admin/users/${res.body.user.id}/status`).set(auth(admin)).send({ isActive: false });
    expect((await request(app).post('/api/auth/refresh').set(XHR).set('Cookie', cookie)).status).toBe(401);
  });

  test('registration is atomic: the user and profile are created together', async () => {
    await registerSeeker('atomic@example.com');
    const seeker = await request(app)
      .get('/api/seekers/me')
      .set(auth((await request(app).post('/api/auth/login').send({ email: 'atomic@example.com', password: 'password123' })).body.token));
    expect(seeker.status).toBe(200);
    expect(seeker.body.profile.user).toBeTruthy();
  });

  test('weak passwords are rejected at the boundary', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'W', email: 'weak@example.com', password: '1234567', role: 'JOB_SEEKER' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8/);
  });

  test('a recruiter token still cannot use seeker-only endpoints', async () => {
    const r = await createRecruiterWithCompany();
    expect((await request(app).get('/api/seekers/me').set(auth(r.token))).status).toBe(403);
  });
});
