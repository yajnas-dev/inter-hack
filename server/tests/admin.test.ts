import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, registerAndLogin, createRecruiterWithCompany, createJob, uploadDummyResume } from './helpers';
import { User } from '../src/models';
import { hashPassword } from '../src/utils/password';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

async function createAdmin() {
  await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    password: await hashPassword('password123'),
    role: 'ADMIN'
  });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' });
  return res.body.token;
}

describe('Admin management & reports (FR-08)', () => {
  test('admin can list and manage users, companies, jobs, and applications', async () => {
    const adminToken = await createAdmin();
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
    await uploadDummyResume(seeker.token);
    await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });

    const users = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(users.status).toBe(200);
    expect(users.body.users.length).toBeGreaterThanOrEqual(3);

    const companies = await request(app).get('/api/admin/companies').set('Authorization', `Bearer ${adminToken}`);
    expect(companies.status).toBe(200);
    expect(companies.body.companies).toHaveLength(1);

    const jobs = await request(app).get('/api/admin/jobs').set('Authorization', `Bearer ${adminToken}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.jobs).toHaveLength(1);

    const applications = await request(app).get('/api/admin/applications').set('Authorization', `Bearer ${adminToken}`);
    expect(applications.status).toBe(200);
    expect(applications.body.applications).toHaveLength(1);
  });

  test('admin can deactivate a user, blocking further login', async () => {
    const adminToken = await createAdmin();
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER', email: 'deactivate@example.com' });

    const deactivate = await request(app)
      .patch(`/api/admin/users/${seeker.user.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);

    const loginAttempt = await request(app).post('/api/auth/login').send({ email: 'deactivate@example.com', password: 'password123' });
    expect(loginAttempt.status).toBe(403);
  });

  test('analytics endpoints report correct aggregated counts', async () => {
    const adminToken = await createAdmin();
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);

    const seekers = await Promise.all([
      registerAndLogin({ role: 'JOB_SEEKER' }),
      registerAndLogin({ role: 'JOB_SEEKER' }),
      registerAndLogin({ role: 'JOB_SEEKER' })
    ]);
    for (const seeker of seekers) {
      await uploadDummyResume(seeker.token);
      await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });
    }

    const firstSeekerApps = await request(app).get('/api/applications/mine').set('Authorization', `Bearer ${seekers[0].token}`);
    const firstApplicationId = firstSeekerApps.body.applications[0].id;

    await request(app)
      .patch(`/api/applications/${firstApplicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'SHORTLISTED' });

    const byStatus = await request(app).get('/api/admin/reports/applications-by-status').set('Authorization', `Bearer ${adminToken}`);
    expect(byStatus.status).toBe(200);
    const statusMap = Object.fromEntries(byStatus.body.results.map((r: { status: string; count: number }) => [r.status, r.count]));
    expect(statusMap.APPLIED).toBe(2);
    expect(statusMap.SHORTLISTED).toBe(1);

    const topJobs = await request(app).get('/api/admin/reports/top-jobs').set('Authorization', `Bearer ${adminToken}`);
    expect(topJobs.status).toBe(200);
    expect(topJobs.body.results[0].applicantCount).toBe(3);
    expect(topJobs.body.results[0].title).toBe(job.title);

    const summary = await request(app).get('/api/admin/reports/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.totalApplications).toBe(3);
  });

  test('a recruiter cannot access admin routes', async () => {
    const recruiter = await createRecruiterWithCompany();
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${recruiter.token}`);
    expect(res.status).toBe(403);
  });
});
