import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { API, PASSWORD, adminToken, app, auth, register, request, unique } from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

const creds = () => ({ name: 'Ana', email: `${unique()}@example.com`, password: PASSWORD, role: 'JOB_SEEKER' });
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0];

describe('registration', () => {
  test('201 with the envelope, an access token, the user, a Location header and an httpOnly refresh cookie', async () => {
    const body = creds();
    const res = await request(app).post(`${API}/auth/register`).send(body);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/api/v1/users/me');
    expect(res.body).toMatchObject({
      success: true,
      data: { tokenType: 'Bearer', expiresIn: 900, user: { email: body.email, role: 'JOB_SEEKER' } }
    });
    expect(res.body.data.accessToken).toMatch(/^eyJ/);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  test('passwords are stored as bcrypt hashes, never in plaintext', async () => {
    const body = creds();
    await request(app).post(`${API}/auth/register`).send(body);
    const { User } = await import('../src/models');
    const stored = await User.findOne({ email: body.email }).select('+password').lean();
    expect(stored!.password).toMatch(/^\$2[aby]\$/);
    expect(stored!.password).not.toContain(PASSWORD);
  });

  test('duplicate email -> 409 EMAIL_TAKEN (case-insensitive)', async () => {
    const body = creds();
    await request(app).post(`${API}/auth/register`).send(body);
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...body, email: body.email.toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('invalid input -> 422 with one detail per field', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ name: '', email: 'nope', password: 'short', role: 'ADMIN' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password', 'role']));
  });

  test('ADMIN cannot self-register', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...creds(), role: 'ADMIN' });
    expect(res.status).toBe(422);
  });

  test('password rules: letters and digits, at most 72 bytes', async () => {
    for (const password of ['allletters', '12345678', `a1${'x'.repeat(71)}`]) {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ ...creds(), password });
      expect(res.status).toBe(422);
    }
  });
});

describe('login', () => {
  test('valid credentials -> 200 with a session', async () => {
    const body = creds();
    await request(app).post(`${API}/auth/register`).send(body);
    const res = await request(app).post(`${API}/auth/login`).send({ email: body.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(body.email);
  });

  test('wrong password and unknown email give the same 401 INVALID_CREDENTIALS', async () => {
    const body = creds();
    await request(app).post(`${API}/auth/register`).send(body);
    const wrong = await request(app).post(`${API}/auth/login`).send({ email: body.email, password: 'wrongpass1' });
    const unknown = await request(app).post(`${API}/auth/login`).send({ email: 'nobody@example.com', password: 'wrongpass1' });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      expect(res.headers['www-authenticate']).toBeUndefined(); // not a bearer-protected resource
    }
  });

  test('operator objects in the body are rejected, not executed (NoSQL injection)', async () => {
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(422);
  });
});

describe('access tokens', () => {
  const sign = (payload: object, options: jwt.SignOptions, secret = env.jwtSecret) => jwt.sign(payload, secret, options);
  const valid = { algorithm: 'HS256', issuer: env.jwtIssuer, audience: env.jwtAudience } as const;

  test('missing token -> 401 UNAUTHENTICATED with a WWW-Authenticate challenge', async () => {
    const res = await request(app).get(`${API}/users/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  test('a valid token reaches the account', async () => {
    const u = await register();
    const res = await request(app).get(`${API}/users/me`).set(auth(u.token));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(u.user.id);
  });

  test('expired token -> 401 TOKEN_EXPIRED', async () => {
    const u = await register();
    const token = sign({ role: 'JOB_SEEKER', iat: Math.floor(Date.now() / 1000) - 3600 }, { ...valid, subject: u.user.id, expiresIn: 60 });
    const res = await request(app).get(`${API}/users/me`).set(auth(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(res.headers['www-authenticate']).toMatch(/^Bearer error="invalid_token"/);
  });

  test.each([
    [
      'a different secret',
      () => sign({ role: 'ADMIN' }, { ...valid, subject: '0'.repeat(24), expiresIn: 60 }, 'another_secret_1234567890')
    ],
    ['the wrong audience', () => sign({ role: 'ADMIN' }, { ...valid, audience: 'someone-else', subject: '0'.repeat(24), expiresIn: 60 })],
    ['the wrong issuer', () => sign({ role: 'ADMIN' }, { ...valid, issuer: 'evil', subject: '0'.repeat(24), expiresIn: 60 })],
    [
      'alg "none"',
      () =>
        `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
          JSON.stringify({ sub: '0'.repeat(24), role: 'ADMIN', iss: env.jwtIssuer, aud: env.jwtAudience, exp: 9999999999 })
        ).toString('base64url')}.`
    ],
    ['garbage', () => 'not.a.jwt']
  ])('token signed with %s -> 401 INVALID_TOKEN', async (_label, make) => {
    const res = await request(app).get(`${API}/users/me`).set(auth(make()));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('a role cannot be forged: tampering with the payload breaks the signature', async () => {
    const u = await register();
    const [h, p, s] = u.token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN' })).toString('base64url')}.${s}`;
    const res = await request(app).get(`${API}/admin/users`).set(auth(forged));
    expect(res.status).toBe(401);
  });

  test('non-Bearer scheme -> 401', async () => {
    const u = await register();
    const res = await request(app).get(`${API}/users/me`).set('Authorization', `Basic ${u.token}`);
    expect(res.status).toBe(401);
  });

  test("a deleted user's token stops working", async () => {
    const u = await register();
    const admin = await adminToken();
    await request(app).delete(`${API}/admin/users/${u.user.id}`).set(auth(admin.token)).expect(204);
    const res = await request(app).get(`${API}/users/me`).set(auth(u.token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('refresh tokens (rotating, httpOnly cookie)', () => {
  test('rotation: a refresh returns a new access token and a new cookie; the old cookie then fails', async () => {
    const u = await register();
    const first = await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch');
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();
    const rotated = cookieOf(first)!;
    expect(rotated).not.toBe(u.cookie);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', rotated).set('X-Requested-With', 'fetch')).status).toBe(200);
  });

  test('cookie refresh without X-Requested-With -> 403 CSRF_CHECK_FAILED', async () => {
    const u = await register();
    const res = await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  test('replaying a rotated token outside the grace window revokes the whole session family (theft detection)', async () => {
    const u = await register();
    const next = cookieOf(await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch'))!;
    const { RefreshToken } = await import('../src/models');
    await RefreshToken.updateMany({ revokedAt: { $exists: true } }, { $set: { revokedAt: new Date(Date.now() - 60_000) } });

    const replay = await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch');
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');
    // The legitimate newest token was revoked too.
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', next).set('X-Requested-With', 'fetch')).status).toBe(401);
  });

  test('logout -> 204 and the refresh token is dead server-side', async () => {
    const u = await register();
    await request(app).post(`${API}/auth/logout`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch').expect(204);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch')).status).toBe(401);
  });

  test('native clients: X-Token-Transport: body returns the refresh token in JSON and sets no cookie', async () => {
    const body = creds();
    const reg = await request(app).post(`${API}/auth/register`).set('X-Token-Transport', 'body').send(body);
    expect(reg.status).toBe(201);
    expect(reg.headers['set-cookie']).toBeUndefined();
    const { refreshToken } = reg.body.data;
    expect(refreshToken).toBeTruthy();

    const refreshed = await request(app).post(`${API}/auth/refresh`).set('X-Token-Transport', 'body').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(refreshToken);
    await request(app).post(`${API}/auth/logout`).send({ refreshToken: refreshed.body.data.refreshToken }).expect(204);
    expect((await request(app).post(`${API}/auth/refresh`).send({ refreshToken: refreshed.body.data.refreshToken })).status).toBe(401);
  });

  test('no session at all -> 401 SESSION_EXPIRED', async () => {
    const res = await request(app).post(`${API}/auth/refresh`).set('X-Requested-With', 'fetch');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('account', () => {
  test('changing the password requires the current one and signs out every session', async () => {
    const u = await register();
    const wrong = await request(app)
      .put(`${API}/users/me/password`)
      .set(auth(u.token))
      .send({ currentPassword: 'nope12345', newPassword: 'newpass123' });
    expect(wrong.status).toBe(401);

    // Access tokens carry second-precision iat; move past the second the token was issued in.
    await new Promise((r) => setTimeout(r, 1100));
    await request(app)
      .put(`${API}/users/me/password`)
      .set(auth(u.token))
      .send({ currentPassword: PASSWORD, newPassword: 'newpass123' })
      .expect(204);

    expect((await request(app).get(`${API}/users/me`).set(auth(u.token))).status).toBe(401);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie!).set('X-Requested-With', 'fetch')).status).toBe(401);
    expect((await request(app).post(`${API}/auth/login`).send({ email: u.user.email, password: 'newpass123' })).status).toBe(200);
  });

  test('PATCH /users/me renames the account', async () => {
    const u = await register();
    const res = await request(app).patch(`${API}/users/me`).set(auth(u.token)).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });
});
