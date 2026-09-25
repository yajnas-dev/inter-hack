import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, createRecruiterWithCompany, createJob } from './helpers';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

describe('Job CRUD ownership (FR-02)', () => {
  test("a recruiter cannot edit or delete another recruiter's job", async () => {
    const recruiterA = await createRecruiterWithCompany('Company A');
    const recruiterB = await createRecruiterWithCompany('Company B');
    const job = await createJob(recruiterA.token, recruiterA.company.id);

    const editRes = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set('Authorization', `Bearer ${recruiterB.token}`)
      .send({ title: 'Hijacked title' });
    expect(editRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/jobs/${job.id}`).set('Authorization', `Bearer ${recruiterB.token}`);
    expect(deleteRes.status).toBe(403);
  });

  test('owning recruiter can edit, close, and delete their job', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);

    const editRes = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ title: 'Updated title' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.job.title).toBe('Updated title');

    const closeRes = await request(app).patch(`/api/jobs/${job.id}/close`).set('Authorization', `Bearer ${recruiter.token}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.job.status).toBe('CLOSED');

    const deleteRes = await request(app).delete(`/api/jobs/${job.id}`).set('Authorization', `Bearer ${recruiter.token}`);
    expect(deleteRes.status).toBe(200);
  });
});

describe('Job search/filter (FR-03, FR-04)', () => {
  test('combines filters with AND, returning the intersection not the union', async () => {
    const recruiter = await createRecruiterWithCompany();
    await createJob(recruiter.token, recruiter.company.id, {
      title: 'Backend Engineer',
      location: 'Bangalore',
      employmentType: 'FULL_TIME',
      requiredSkills: ['Node.js']
    });
    await createJob(recruiter.token, recruiter.company.id, {
      title: 'Backend Engineer',
      location: 'Delhi',
      employmentType: 'FULL_TIME',
      requiredSkills: ['Node.js']
    });
    await createJob(recruiter.token, recruiter.company.id, {
      title: 'Frontend Engineer',
      location: 'Bangalore',
      employmentType: 'PART_TIME',
      requiredSkills: ['React']
    });

    const res = await request(app).get('/api/jobs').query({
      location: 'Bangalore',
      employmentType: 'FULL_TIME'
    });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].title).toBe('Backend Engineer');
    expect(res.body.jobs[0].location).toBe('Bangalore');
  });

  test('job detail page returns full job information', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id);

    const res = await request(app).get(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe(job.title);
    expect(res.body.job.company.id).toBe(recruiter.company.id);
  });

  test('closed jobs are excluded from public search results', async () => {
    const recruiter = await createRecruiterWithCompany();
    const job = await createJob(recruiter.token, recruiter.company.id, { location: 'Pune' });
    await request(app).patch(`/api/jobs/${job.id}/close`).set('Authorization', `Bearer ${recruiter.token}`);

    const res = await request(app).get('/api/jobs').query({ location: 'Pune' });
    expect(res.body.jobs).toHaveLength(0);
  });
});
