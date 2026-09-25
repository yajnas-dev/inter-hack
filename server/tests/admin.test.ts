import {
  API,
  PASSWORD,
  adminToken,
  app,
  apply,
  auth,
  createJob,
  recruiterWithCompany,
  register,
  request,
  seekerWithResume
} from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

describe('admin endpoints are admin-only', () => {
  test.each([
    ['get', '/admin/users'],
    ['get', '/admin/companies'],
    ['get', '/admin/jobs'],
    ['get', '/admin/applications'],
    ['get', '/reports/summary'],
    ['get', '/reports/top-jobs']
  ] as const)('%s %s: 401 anonymous, 403 for seekers and recruiters', async (method, path) => {
    const s = await register();
    const r = await register({ role: 'RECRUITER' });
    expect((await request(app)[method](`${API}${path}`)).status).toBe(401);
    for (const token of [s.token, r.token]) {
      const res = await request(app)[method](`${API}${path}`).set(auth(token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('managing users', () => {
  test('list with role filter, prefix search and paging meta', async () => {
    const admin = await adminToken();
    await register({ name: 'Priya Nair' });
    await register({ name: 'Rahul Iyer', role: 'RECRUITER' });
    await register({ name: 'Pradeep K' });

    const seekers = await request(app).get(`${API}/admin/users?role=JOB_SEEKER&limit=1`).set(auth(admin.token));
    expect(seekers.body.data).toHaveLength(1);
    expect(seekers.body.meta).toMatchObject({ total: 2, totalPages: 2, hasNextPage: true });
    const search = await request(app).get(`${API}/admin/users?q=pr`).set(auth(admin.token));
    expect(search.body.data.map((u: { name: string }) => u.name).sort()).toEqual(['Pradeep K', 'Priya Nair']);
    expect(JSON.stringify(search.body)).not.toMatch(/password/i);
    expect((await request(app).get(`${API}/admin/users?role=GOD`).set(auth(admin.token))).status).toBe(422);
  });

  test('deactivation takes effect immediately: existing token rejected, login refused; reactivation restores', async () => {
    const admin = await adminToken();
    const u = await register();
    const off = await request(app).patch(`${API}/admin/users/${u.user.id}`).set(auth(admin.token)).send({ isActive: false });
    expect(off.body.data.isActive).toBe(false);

    const me = await request(app).get(`${API}/users/me`).set(auth(u.token));
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('ACCOUNT_DISABLED');
    const login = await request(app).post(`${API}/auth/login`).send({ email: u.user.email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');

    await request(app).patch(`${API}/admin/users/${u.user.id}`).set(auth(admin.token)).send({ isActive: true }).expect(200);
    expect((await request(app).post(`${API}/auth/login`).send({ email: u.user.email, password: PASSWORD })).status).toBe(200);
  });

  test('an admin cannot deactivate or delete themself', async () => {
    const admin = await adminToken();
    expect((await request(app).patch(`${API}/admin/users/${admin.id}`).set(auth(admin.token)).send({ isActive: false })).status).toBe(403);
    expect((await request(app).delete(`${API}/admin/users/${admin.id}`).set(auth(admin.token))).status).toBe(403);
  });

  test('deleting a recruiter removes their company, its jobs and those applications; the applicant stays', async () => {
    const admin = await adminToken();
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    const s = await seekerWithResume();
    await apply(s.token, job.id);

    await request(app).delete(`${API}/admin/users/${r.user.id}`).set(auth(admin.token)).expect(204);
    expect((await request(app).get(`${API}/companies/${r.company.id}`)).status).toBe(404);
    expect((await request(app).get(`${API}/jobs/${job.id}`)).status).toBe(404);
    expect((await request(app).get(`${API}/applications`).set(auth(s.token))).body.data).toEqual([]);
    expect((await request(app).get(`${API}/users/me`).set(auth(s.token))).status).toBe(200);
  });

  test('deleting a seeker removes their applications and resume files', async () => {
    const admin = await adminToken();
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    const s = await seekerWithResume();
    await apply(s.token, job.id);

    await request(app).delete(`${API}/admin/users/${s.user.id}`).set(auth(admin.token)).expect(204);
    expect((await request(app).get(`${API}/jobs/${job.id}/applications`).set(auth(r.token))).body.data).toEqual([]);
    const { Resume } = await import('../src/models');
    expect(await Resume.countDocuments({})).toBe(0);
    const mongoose = (await import('mongoose')).default;
    expect(await mongoose.connection.db!.collection('resumes.files').countDocuments({})).toBe(0);
  });

  test('unknown user -> 404', async () => {
    const admin = await adminToken();
    expect(
      (
        await request(app)
          .get(`${API}/admin/users/${'0'.repeat(24)}`)
          .set(auth(admin.token))
      ).status
    ).toBe(404);
  });
});

describe('managing companies, jobs and applications', () => {
  test('companies list with open-job counts; deleting a company cascades', async () => {
    const admin = await adminToken();
    const r = await recruiterWithCompany('Globex');
    await createJob(r.token);
    const list = await request(app).get(`${API}/admin/companies?q=glo`).set(auth(admin.token));
    expect(list.body.data[0]).toMatchObject({ name: 'Globex', openJobs: 1 });

    await request(app).delete(`${API}/admin/companies/${r.company.id}`).set(auth(admin.token)).expect(204);
    expect((await request(app).get(`${API}/jobs`)).body.data).toEqual([]);
    // The recruiter can register a new company afterwards.
    expect((await request(app).post(`${API}/companies`).set(auth(r.token)).send({ name: 'Globex 2' })).status).toBe(201);
  });

  test('jobs and applications lists with filters', async () => {
    const admin = await adminToken();
    const r = await recruiterWithCompany();
    const a = await createJob(r.token, { title: 'Alpha Role' });
    const b = await createJob(r.token, { title: 'Beta Role' });
    await request(app).patch(`${API}/jobs/${b.id}`).set(auth(r.token)).send({ status: 'CLOSED' });
    const s = await seekerWithResume();
    await apply(s.token, a.id);

    const closed = await request(app).get(`${API}/admin/jobs?status=CLOSED`).set(auth(admin.token));
    expect(closed.body.data.map((j: { title: string }) => j.title)).toEqual(['Beta Role']);
    const byTitle = await request(app).get(`${API}/admin/jobs?q=alpha`).set(auth(admin.token));
    expect(byTitle.body.data[0]).toMatchObject({ title: 'Alpha Role', applicantCount: 1, postedBy: { id: r.user.id } });

    const apps = await request(app).get(`${API}/admin/applications?status=APPLIED`).set(auth(admin.token));
    expect(apps.body.meta.total).toBe(1);
  });
});

describe('reports', () => {
  test('summary, time series and top lists', async () => {
    const admin = await adminToken();
    const r = await recruiterWithCompany('Initech');
    const job = await createJob(r.token, { title: 'Popular' });
    for (let i = 0; i < 2; i += 1) await apply((await seekerWithResume()).token, job.id);

    const summary = await request(app).get(`${API}/reports/summary`).set(auth(admin.token));
    expect(summary.body.data).toMatchObject({
      totalSeekers: 2,
      totalRecruiters: 1,
      totalAdmins: 1,
      totalCompanies: 1,
      totalJobsOpen: 1,
      totalApplications: 2,
      applicationsByStatus: { APPLIED: 2, SELECTED: 0 }
    });

    const series = await request(app).get(`${API}/reports/applications-over-time?days=7`).set(auth(admin.token));
    expect(series.body.data.at(-1).count).toBe(2);
    expect(series.body.meta.days).toBe(7);
    expect((await request(app).get(`${API}/reports/applications-over-time?days=9999`).set(auth(admin.token))).status).toBe(422);

    const topJobs = await request(app).get(`${API}/reports/top-jobs`).set(auth(admin.token));
    expect(topJobs.body.data[0]).toMatchObject({ jobId: job.id, title: 'Popular', company: 'Initech', applicantCount: 2 });
    const topCompanies = await request(app).get(`${API}/reports/top-companies`).set(auth(admin.token));
    expect(topCompanies.body.data[0]).toMatchObject({ name: 'Initech', applicantCount: 2 });
  });
});
