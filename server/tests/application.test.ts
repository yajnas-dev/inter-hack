import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, registerAndLogin, createRecruiterWithCompany, createJob, uploadDummyResume } from './helpers';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

async function seekerWithResume() {
  const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
  await uploadDummyResume(seeker.token);
  return seeker;
}

describe('Job application & tracking (FR-05)', () => {
  test('a seeker can apply once but a duplicate application is rejected', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);
    const seeker = await seekerWithResume();

    const first = await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });
    expect(second.status).toBe(409);
  });

  test('a seeker without a resume cannot apply', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });

    const res = await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });
    expect(res.status).toBe(400);
  });

  test('a seeker can view their own applications and application history', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);
    const seeker = await seekerWithResume();

    await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });

    const res = await request(app).get('/api/applications/mine').set('Authorization', `Bearer ${seeker.token}`);
    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].status).toBe('APPLIED');
  });
});

describe('Recruiter applicant management & isolation (FR-06)', () => {
  test("recruiter B cannot see recruiter A's applicants or job applications", async () => {
    const recruiterA = await createRecruiterWithCompany('Company A');
    const recruiterB = await createRecruiterWithCompany('Company B');
    const jobA = await createJob(recruiterA.token, recruiterA.company.id);
    const seeker = await seekerWithResume();

    await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: jobA.id });

    const listRes = await request(app).get(`/api/jobs/${jobA.id}/applications`).set('Authorization', `Bearer ${recruiterB.token}`);
    expect(listRes.status).toBe(403);

    const ownListRes = await request(app).get(`/api/jobs/${jobA.id}/applications`).set('Authorization', `Bearer ${recruiterA.token}`);
    expect(ownListRes.status).toBe(200);
    expect(ownListRes.body.applications).toHaveLength(1);
  });

  test('resume download is blocked for a recruiter who does not own the job', async () => {
    const recruiterA = await createRecruiterWithCompany('Company A');
    const recruiterB = await createRecruiterWithCompany('Company B');
    const jobA = await createJob(recruiterA.token, recruiterA.company.id);
    const seeker = await seekerWithResume();

    const applyRes = await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: jobA.id });
    const applicationId = applyRes.body.application.id;

    const blocked = await request(app).get(`/api/applications/${applicationId}/resume`).set('Authorization', `Bearer ${recruiterB.token}`);
    expect(blocked.status).toBe(403);

    const allowed = await request(app).get(`/api/applications/${applicationId}/resume`).set('Authorization', `Bearer ${recruiterA.token}`);
    expect(allowed.status).toBe(200);
  });
});

describe('Application status workflow (FR-07)', () => {
  async function setupApplication() {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);
    const seeker = await seekerWithResume();
    const applyRes = await request(app).post('/api/applications').set('Authorization', `Bearer ${seeker.token}`).send({ jobId: job.id });
    return { recruiter, seeker, applicationId: applyRes.body.application.id };
  }

  test('valid forward transitions succeed end to end', async () => {
    const { recruiter, applicationId } = await setupApplication();

    for (const status of ['SHORTLISTED', 'INTERVIEW', 'SELECTED']) {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe(status);
    }
  });

  test('illegal transitions are rejected (skipping steps, or leaving SELECTED)', async () => {
    const { recruiter, applicationId } = await setupApplication();

    const skip = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'SELECTED' });
    expect(skip.status).toBe(400);

    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'SHORTLISTED' });
    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'INTERVIEW' });
    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'SELECTED' });

    const afterSelected = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'REJECTED' });
    expect(afterSelected.status).toBe(400);
  });

  test('a status change by the recruiter is visible to the owning seeker', async () => {
    const { recruiter, seeker, applicationId } = await setupApplication();

    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'SHORTLISTED' });

    const seekerView = await request(app).get(`/api/applications/${applicationId}`).set('Authorization', `Bearer ${seeker.token}`);
    expect(seekerView.status).toBe(200);
    expect(seekerView.body.application.status).toBe('SHORTLISTED');
  });

  test('a job seeker cannot update application status', async () => {
    const { seeker, applicationId } = await setupApplication();

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${seeker.token}`)
      .send({ status: 'SHORTLISTED' });
    expect(res.status).toBe(403);
  });
});
