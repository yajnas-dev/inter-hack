import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, registerAndLogin, createRecruiterWithCompany, createJob, uploadDummyResume, auth } from './helpers';
import { User, Job, Application } from '../src/models';
import { hashPassword } from '../src/utils/password';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

async function adminToken() {
  await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    password: await hashPassword('password123'),
    role: 'ADMIN'
  });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' });
  return res.body.token;
}

async function applyTo(job: { id: string }) {
  const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
  await uploadDummyResume(seeker.token);
  const res = await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });
  return { seeker, applicationId: res.body.application.id };
}

describe('Search efficiency & safety (FR-04)', () => {
  test('title search uses the text index and combines with other filters', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { title: 'Senior Backend Engineer', location: 'Pune' });
    await createJob(r.token, r.company.id, { title: 'Graphic Designer', location: 'Pune' });

    const res = await request(app).get('/api/jobs').query({ title: 'backend', location: 'pune' });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toEqual(['Senior Backend Engineer']);
  });

  test('regex metacharacters in filters are treated literally', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { location: 'Delhi' });

    const res = await request(app).get('/api/jobs').query({ location: '.*' });
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
  });

  test('skills filter is case-insensitive and page size is capped', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { requiredSkills: ['React', 'Node.js'] });

    const res = await request(app).get('/api/jobs').query({ skills: 'react', limit: 1000 });
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.jobs[0].locationLower).toBeUndefined();
  });
});

describe('Account safety', () => {
  test("a deactivated user's existing token stops working immediately", async () => {
    const token = await adminToken();
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
    expect((await request(app).get('/api/auth/me').set(auth(seeker.token))).status).toBe(200);

    await request(app).patch(`/api/admin/users/${seeker.user.id}/status`).set(auth(token)).send({ isActive: false });

    expect((await request(app).get('/api/auth/me').set(auth(seeker.token))).status).toBe(401);
  });
});

describe('Resume integrity (FR-01, FR-06)', () => {
  test('replacing a resume does not break resumes of existing applications', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    const { seeker, applicationId } = await applyTo(job);

    await request(app)
      .post('/api/seekers/me/resume')
      .set(auth(seeker.token))
      .attach('resume', Buffer.from('%PDF-1.4 newer resume'), { filename: 'new.pdf', contentType: 'application/pdf' });

    const res = await request(app)
      .get(`/api/applications/${applicationId}/resume`)
      .set(auth(r.token))
      .buffer(true)
      .parse((stream, cb) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain('dummy resume content');
  });

  test('non-PDF/DOC uploads are rejected', async () => {
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
    const res = await request(app)
      .post('/api/seekers/me/resume')
      .set(auth(seeker.token))
      .attach('resume', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('Admin cascades (FR-08)', () => {
  test("deleting a recruiter removes their jobs and those jobs' applications", async () => {
    const token = await adminToken();
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    await applyTo(job);
    expect(await Application.countDocuments()).toBe(1);

    const res = await request(app).delete(`/api/admin/users/${r.user.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(await Job.countDocuments()).toBe(0);
    expect(await Application.countDocuments()).toBe(0);
  });
});

describe('Payload trimming & reporting', () => {
  test('job list omits the description but the detail page includes it', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id, { description: 'Long description text' });

    const list = await request(app).get('/api/jobs');
    expect(list.body.jobs[0].description).toBeUndefined();
    expect(list.body.jobs[0].title).toBe(job.title);

    const detail = await request(app).get(`/api/jobs/${job.id}`);
    expect(detail.body.job.description).toBe('Long description text');
  });

  test('top-companies report groups applications by the denormalised company', async () => {
    const token = await adminToken();
    const a = await createRecruiterWithCompany('Alpha');
    const b = await createRecruiterWithCompany('Beta');
    const jobA = await createJob(a.token, a.company.id);
    const jobB = await createJob(b.token, b.company.id);
    await applyTo(jobA);
    await applyTo(jobA);
    await applyTo(jobB);

    const res = await request(app).get('/api/admin/reports/top-companies').set(auth(token));
    expect(res.body.results.map((x: { name: string; applicantCount: number }) => [x.name, x.applicantCount])).toEqual([
      ['Alpha', 2],
      ['Beta', 1]
    ]);
  });

  test('admin lists are paginated and report a total', async () => {
    const token = await adminToken();
    await registerAndLogin({ role: 'JOB_SEEKER' });
    await registerAndLogin({ role: 'JOB_SEEKER' });

    const res = await request(app).get('/api/admin/users').query({ limit: 2 }).set(auth(token));
    expect(res.body.users).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });
});
