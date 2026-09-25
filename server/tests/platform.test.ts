import mongoose from 'mongoose';
import { isValidTransition, nextStatuses, jobCreateBody, registerBody, APPLICATION_STATUSES } from '@jobportal/shared';
import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, auth, createRecruiterWithCompany, createJob, adminToken } from './helpers';
import { supportsTransactions, withTransaction } from '../src/infra/db';
import { startChangeStreams } from '../src/infra/changeStreams';
import { events } from '../src/infra/events';
import { Company, Job, Application } from '../src/models';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

describe('shared contract: status workflow (FR-07)', () => {
  test('forward path and rejection rules', () => {
    expect(isValidTransition('APPLIED', 'SHORTLISTED')).toBe(true);
    expect(isValidTransition('SHORTLISTED', 'INTERVIEW')).toBe(true);
    expect(isValidTransition('INTERVIEW', 'SELECTED')).toBe(true);
    for (const from of ['APPLIED', 'SHORTLISTED', 'INTERVIEW'] as const) expect(isValidTransition(from, 'REJECTED')).toBe(true);
  });

  test('no skipping, no going back, nothing leaves SELECTED or REJECTED', () => {
    expect(isValidTransition('APPLIED', 'SELECTED')).toBe(false);
    expect(isValidTransition('APPLIED', 'INTERVIEW')).toBe(false);
    expect(isValidTransition('INTERVIEW', 'SHORTLISTED')).toBe(false);
    expect(nextStatuses('SELECTED')).toEqual([]);
    expect(nextStatuses('REJECTED')).toEqual([]);
    expect(APPLICATION_STATUSES).toEqual(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED']);
  });
});

describe('shared contract: request schemas', () => {
  const base = {
    company: 'a'.repeat(24),
    title: 'T',
    description: 'D',
    location: 'L',
    salaryMin: 10,
    salaryMax: 5,
    experienceRequired: 1,
    employmentType: 'FULL_TIME'
  };

  test('salaryMax below salaryMin is rejected with a clear message', () => {
    const r = jobCreateBody.safeParse(base);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toMatch(/salaryMax must be greater than or equal to salaryMin/);
    expect(jobCreateBody.safeParse({ ...base, salaryMax: 20 }).success).toBe(true);
  });

  test('registration normalises email and refuses ADMIN self-registration', () => {
    expect(registerBody.parse({ name: ' A ', email: ' MiXed@Example.COM ', password: 'longenough', role: 'RECRUITER' }).email).toBe(
      'mixed@example.com'
    );
    expect(registerBody.safeParse({ name: 'A', email: 'a@b.co', password: 'longenough', role: 'ADMIN' }).success).toBe(false);
  });

  test('the API enforces the same rules end to end', async () => {
    const r = await createRecruiterWithCompany();
    const res = await request(app)
      .post('/api/jobs')
      .set(auth(r.token))
      .send({ ...base, company: r.company.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/salaryMax/);

    expect((await request(app).get('/api/jobs/not-an-id')).status).toBe(400);
    expect((await request(app).put(`/api/companies/${r.company.id}`).set(auth(r.token)).send({ name: '' })).status).toBe(400);
  });
});

describe('transactions (replica set)', () => {
  test('the test database supports transactions', () => {
    expect(supportsTransactions()).toBe(true);
  });

  test('a failure inside withTransaction rolls every write back', async () => {
    const owner = new mongoose.Types.ObjectId();
    await expect(
      withTransaction(async (session) => {
        await Company.create([{ name: 'Ghost Co', createdBy: owner }], { session });
        expect(await Company.countDocuments({ name: 'Ghost Co' }).session(session ?? null)).toBe(1);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await Company.countDocuments({ name: 'Ghost Co' })).toBe(0);
  });

  test('deleting a job removes its applications atomically and leaves nothing behind', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    await Application.create({ job: job.id, applicant: new mongoose.Types.ObjectId(), status: 'APPLIED', statusHistory: [] });

    expect((await request(app).delete(`/api/jobs/${job.id}`).set(auth(r.token))).status).toBe(200);
    expect(await Job.countDocuments()).toBe(0);
    expect(await Application.countDocuments()).toBe(0);
  });

  test('deleting a user cascades through companies, jobs and applications', async () => {
    const token = await adminToken();
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    await Application.create({ job: job.id, applicant: new mongoose.Types.ObjectId(), status: 'APPLIED', statusHistory: [] });

    expect((await request(app).delete(`/api/admin/users/${r.user.id}`).set(auth(token))).status).toBe(200);
    expect([await Company.countDocuments(), await Job.countDocuments(), await Application.countDocuments()]).toEqual([0, 0, 0]);
  });
});

describe('change streams: cross-worker cache invalidation', () => {
  test('any write to the jobs collection (even from another process) emits jobs.changed', async () => {
    const stop = startChangeStreams();
    const changed = new Promise<void>((resolve) => events.on('jobs.changed', () => resolve()));
    await new Promise((r) => setTimeout(r, 500)); // let the stream attach

    // Bypass the service layer entirely, like a second worker would.
    await Job.collection.insertOne({ title: 'raw', company: new mongoose.Types.ObjectId(), postedBy: new mongoose.Types.ObjectId() });

    await expect(
      Promise.race([changed, new Promise((_, rej) => setTimeout(() => rej(new Error('no change event')), 5000))])
    ).resolves.toBeUndefined();
    await (await stop)();
  });
});

describe('environment validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('production refuses the development JWT secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'dev_secret_change_me_please');
    vi.resetModules();
    await expect(import('../src/config/env')).rejects.toThrow(/JWT_SECRET/);
  });

  test('production accepts a real secret; malformed values fail fast with a clear message', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-long-random-production-secret-value');
    vi.resetModules();
    const { env } = await import('../src/config/env');
    expect(env.isProd).toBe(true);

    vi.stubEnv('PORT', 'not-a-port');
    vi.resetModules();
    await expect(import('../src/config/env')).rejects.toThrow(/PORT/);
  });
});
