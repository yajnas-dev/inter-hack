import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request } from './helpers';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

describe('Auth (FR-01, FR-02)', () => {
  test('registers a job seeker and returns a JWT with correct role claim', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Seeker One',
      email: 'seeker1@example.com',
      password: 'password123',
      role: 'JOB_SEEKER'
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('JOB_SEEKER');
  });

  test('registers a recruiter', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Recruiter One',
      email: 'recruiter1@example.com',
      password: 'password123',
      role: 'RECRUITER'
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('RECRUITER');
  });

  test('rejects duplicate email registration', async () => {
    const payload = {
      name: 'Dup',
      email: 'dup@example.com',
      password: 'password123',
      role: 'JOB_SEEKER'
    };
    await request(app).post('/api/auth/register').send(payload);
    const res = await request(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(409);
  });

  test('logs in with correct credentials and rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login Test',
      email: 'login@example.com',
      password: 'password123',
      role: 'JOB_SEEKER'
    });

    const ok = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'wrongpassword' });
    expect(bad.status).toBe(401);
  });

  test('rejects unauthenticated access to a protected route', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a job seeker token on an admin-only route', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Seeker Two',
      email: 'seeker2@example.com',
      password: 'password123',
      role: 'JOB_SEEKER'
    });

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(403);
  });
});
