import { Types } from 'mongoose';
import { Job, Notification, SavedJob } from '../src/models';
import { adminToken, app, auth, createJob, createRecruiterWithCompany, registerAndLogin, request, uploadDummyResume } from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

interface JobRow {
  id: string;
  title: string;
  salaryMax: number;
  applicantCount?: number;
}

/** Notifications are written by domain-event subscribers, so poll briefly instead of assuming ordering. */
async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() - start > timeoutMs) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function seekerWithResume(overrides: Record<string, unknown> = {}) {
  const seeker = await registerAndLogin({ role: 'JOB_SEEKER', ...overrides });
  await uploadDummyResume(seeker.token);
  return seeker;
}

const jobs = async (query: Record<string, unknown>) =>
  (await request(app).get('/api/jobs').query(query)).body as { jobs: JobRow[]; total?: number; page?: number };

describe('search filters (FR-04)', () => {
  test('employment type accepts a comma list, ignores unknown values, and combines with other filters', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { title: 'A', employmentType: 'FULL_TIME' });
    await createJob(r.token, r.company.id, { title: 'B', employmentType: 'REMOTE' });
    await createJob(r.token, r.company.id, { title: 'C', employmentType: 'INTERNSHIP' });

    const two = await jobs({ employmentType: 'FULL_TIME,REMOTE' });
    expect(two.jobs.map((j) => j.title).sort()).toEqual(['A', 'B']);
    expect((await jobs({ employmentType: 'FULL_TIME,NOPE' })).jobs.map((j) => j.title)).toEqual(['A']);
    expect((await jobs({ employmentType: 'NOPE' })).jobs).toHaveLength(3);
  });

  test('minSalary keeps jobs whose top salary reaches it', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { title: 'Low', salaryMin: 10, salaryMax: 20 });
    await createJob(r.token, r.company.id, { title: 'High', salaryMin: 10, salaryMax: 90 });
    expect((await jobs({ minSalary: 50 })).jobs.map((j) => j.title)).toEqual(['High']);
    expect((await jobs({ minSalary: 20 })).jobs).toHaveLength(2);
  });

  test('postedWithin drops older jobs; only the documented windows are accepted', async () => {
    const r = await createRecruiterWithCompany();
    const old = await createJob(r.token, r.company.id, { title: 'Old' });
    await createJob(r.token, r.company.id, { title: 'Fresh' });
    // createdAt is immutable through Mongoose, so backdate through the raw collection.
    await Job.collection.updateOne({ _id: new Types.ObjectId(old.id) }, { $set: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });

    expect((await jobs({ postedWithin: 7 })).jobs.map((j) => j.title)).toEqual(['Fresh']);
    expect((await jobs({ postedWithin: 14 })).jobs).toHaveLength(2);
    expect((await jobs({ postedWithin: 5 })).jobs).toHaveLength(2); // not an allowed window: ignored
  });

  test("company filter shows only that company's open jobs", async () => {
    const a = await createRecruiterWithCompany('Alpha');
    const b = await createRecruiterWithCompany('Beta');
    await createJob(a.token, a.company.id, { title: 'AlphaJob' });
    await createJob(b.token, b.company.id, { title: 'BetaJob' });
    expect((await jobs({ company: a.company.id })).jobs.map((j) => j.title)).toEqual(['AlphaJob']);
    expect((await jobs({ company: 'not-an-id' })).jobs).toHaveLength(2);
  });

  test('sort=salary orders by top salary and pages by number', async () => {
    const r = await createRecruiterWithCompany();
    for (const [title, salaryMax] of [
      ['S1', 30],
      ['S2', 90],
      ['S3', 60],
      ['S4', 10]
    ] as const) {
      await createJob(r.token, r.company.id, { title, salaryMin: 1, salaryMax });
    }
    const first = await jobs({ sort: 'salary', limit: 2 });
    expect(first.jobs.map((j) => j.title)).toEqual(['S2', 'S3']);
    expect(first.total).toBe(4);
    const second = await jobs({ sort: 'salary', limit: 2, page: 2 });
    expect(second.jobs.map((j) => j.title)).toEqual(['S1', 'S4']);
  });

  test('every filter together still returns the intersection', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, {
      title: 'Node Dev',
      location: 'Pune',
      employmentType: 'FULL_TIME',
      salaryMin: 1,
      salaryMax: 100,
      requiredSkills: ['Node.js'],
      experienceRequired: 2
    });
    await createJob(r.token, r.company.id, {
      title: 'Node Dev',
      location: 'Delhi',
      employmentType: 'FULL_TIME',
      salaryMin: 1,
      salaryMax: 100,
      requiredSkills: ['Node.js'],
      experienceRequired: 2
    });
    await createJob(r.token, r.company.id, {
      title: 'Node Dev',
      location: 'Pune',
      employmentType: 'PART_TIME',
      salaryMin: 1,
      salaryMax: 100,
      requiredSkills: ['Node.js'],
      experienceRequired: 2
    });
    const res = await jobs({
      title: 'node',
      location: 'pune',
      employmentType: 'FULL_TIME',
      minSalary: 50,
      skills: 'node.js',
      experience: 3,
      postedWithin: 7,
      company: r.company.id
    });
    expect(res.jobs).toHaveLength(1);
  });
});

describe('facets and similar jobs', () => {
  test('facets count open jobs only, by location, skill and type', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { location: 'Pune', requiredSkills: ['React', 'Node.js'], employmentType: 'FULL_TIME' });
    await createJob(r.token, r.company.id, { location: 'Pune', requiredSkills: ['React'], employmentType: 'REMOTE' });
    const closed = await createJob(r.token, r.company.id, { location: 'Delhi', requiredSkills: ['Go'] });
    await request(app).patch(`/api/jobs/${closed.id}/close`).set(auth(r.token));

    const { body } = await request(app).get('/api/jobs/facets');
    expect(body.totalOpen).toBe(2);
    expect(body.locations).toEqual([{ name: 'Pune', count: 2 }]);
    expect(body.skills.find((s: { name: string }) => s.name === 'React').count).toBe(2);
    expect(body.skills.some((s: { name: string }) => s.name === 'Go')).toBe(false);
    expect(body.employmentTypes.find((t: { name: string }) => t.name === 'REMOTE').count).toBe(1);
  });

  test('similar jobs share a skill or company, exclude the job itself and closed jobs', async () => {
    const a = await createRecruiterWithCompany('Alpha');
    const b = await createRecruiterWithCompany('Beta');
    const base = await createJob(a.token, a.company.id, { title: 'Base', requiredSkills: ['React'] });
    await createJob(a.token, a.company.id, { title: 'SameCompany', requiredSkills: ['COBOL'] });
    await createJob(b.token, b.company.id, { title: 'SameSkill', requiredSkills: ['react'] });
    await createJob(b.token, b.company.id, { title: 'Unrelated', requiredSkills: ['Fortran'] });
    const closed = await createJob(b.token, b.company.id, { title: 'ClosedMatch', requiredSkills: ['React'] });
    await request(app).patch(`/api/jobs/${closed.id}/close`).set(auth(b.token));

    const { body } = await request(app).get(`/api/jobs/${base.id}/similar`);
    expect(body.jobs.map((j: JobRow) => j.title).sort()).toEqual(['SameCompany', 'SameSkill']);
    expect((await request(app).get('/api/jobs/000000000000000000000000/similar')).status).toBe(404);
  });
});

describe('saved jobs', () => {
  test('save is idempotent; list keeps newest-first order; ids feed the hearts; unsave removes', async () => {
    const r = await createRecruiterWithCompany();
    const one = await createJob(r.token, r.company.id, { title: 'One' });
    const two = await createJob(r.token, r.company.id, { title: 'Two' });
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
    const put = (id: string) => request(app).put(`/api/seekers/me/saved/${id}`).set(auth(seeker.token));

    expect((await put(one.id)).status).toBe(200);
    expect((await put(one.id)).status).toBe(200); // saving twice is fine
    await put(two.id);
    expect(await SavedJob.countDocuments()).toBe(2);

    const ids = await request(app).get('/api/seekers/me/saved/ids').set(auth(seeker.token));
    expect(ids.body.ids.sort()).toEqual([one.id, two.id].sort());

    const list = await request(app).get('/api/seekers/me/saved').set(auth(seeker.token));
    expect(list.body.jobs.map((j: JobRow) => j.title)).toEqual(['Two', 'One']);
    expect(list.body.total).toBe(2);

    await request(app).delete(`/api/seekers/me/saved/${one.id}`).set(auth(seeker.token));
    expect((await request(app).get('/api/seekers/me/saved/ids').set(auth(seeker.token))).body.ids).toEqual([two.id]);
  });

  test('unknown jobs are 404, recruiters cannot save, and deleting a job clears its bookmarks', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });

    expect((await request(app).put('/api/seekers/me/saved/000000000000000000000000').set(auth(seeker.token))).status).toBe(404);
    expect((await request(app).put(`/api/seekers/me/saved/${job.id}`).set(auth(r.token))).status).toBe(403);
    expect((await request(app).get('/api/seekers/me/saved/ids')).status).toBe(401);

    await request(app).put(`/api/seekers/me/saved/${job.id}`).set(auth(seeker.token));
    await request(app).delete(`/api/jobs/${job.id}`).set(auth(r.token));
    expect(await SavedJob.countDocuments()).toBe(0);
  });
});

describe('recruiter: applicant profile (FR-06), overview, applicant counts', () => {
  async function scenario() {
    const owner = await createRecruiterWithCompany('Owner Co');
    const other = await createRecruiterWithCompany('Other Co');
    const job = await createJob(owner.token, owner.company.id, { title: 'Engineer' });
    const seeker = await seekerWithResume({ name: 'Priya P' });
    await request(app)
      .put('/api/seekers/me')
      .set(auth(seeker.token))
      .send({
        headline: 'Backend dev',
        phone: '555-0100',
        skills: ['Node.js', 'MongoDB'],
        education: [{ degree: 'BSc', institution: 'MIT' }],
        experience: [{ title: 'Dev', company: 'Acme' }]
      });
    const applied = await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });
    return { owner, other, job, seeker, applicationId: applied.body.application.id as string };
  }

  test("the owning recruiter sees the applicant's profile; nobody else does", async () => {
    const s = await scenario();
    const res = await request(app).get(`/api/applications/${s.applicationId}/applicant`).set(auth(s.owner.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Priya P', headline: 'Backend dev', phone: '555-0100', skills: ['Node.js', 'MongoDB'] });
    expect(res.body.education[0].institution).toBe('MIT');
    expect(res.body.experience[0].company).toBe('Acme');

    expect((await request(app).get(`/api/applications/${s.applicationId}/applicant`).set(auth(s.other.token))).status).toBe(403);
    expect((await request(app).get(`/api/applications/${s.applicationId}/applicant`).set(auth(s.seeker.token))).status).toBe(403);
    expect((await request(app).get(`/api/applications/${s.applicationId}/applicant`)).status).toBe(401);
  });

  test('overview totals applicants by stage and jobs by status, and only for the caller', async () => {
    const s = await scenario();
    await request(app).patch(`/api/applications/${s.applicationId}/status`).set(auth(s.owner.token)).send({ status: 'SHORTLISTED' });
    const closed = await createJob(s.owner.token, s.owner.company.id, { title: 'Closed one' });
    await request(app).patch(`/api/jobs/${closed.id}/close`).set(auth(s.owner.token));

    const res = await request(app).get('/api/recruiters/me/overview').set(auth(s.owner.token));
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual({ open: 1, closed: 1 });
    expect(res.body.applicantsByStatus).toEqual({ APPLIED: 0, SHORTLISTED: 1, INTERVIEW: 0, SELECTED: 0, REJECTED: 0 });
    expect(res.body.totalApplicants).toBe(1);
    expect(res.body.newThisWeek).toBe(1);
    expect(res.body.recent[0].applicant.name).toBe('Priya P');

    const empty = await request(app).get('/api/recruiters/me/overview').set(auth(s.other.token));
    expect(empty.body.totalApplicants).toBe(0);
    expect((await request(app).get('/api/recruiters/me/overview').set(auth(s.seeker.token))).status).toBe(403);
  });

  test('my jobs include the number of applications each received', async () => {
    const s = await scenario();
    await createJob(s.owner.token, s.owner.company.id, { title: 'Nobody applied' });
    const mine = await request(app).get('/api/jobs/mine').set(auth(s.owner.token));
    const byTitle = Object.fromEntries(mine.body.jobs.map((j: JobRow) => [j.title, j.applicantCount]));
    expect(byTitle).toEqual({ Engineer: 1, 'Nobody applied': 0 });
  });
});

describe('notifications', () => {
  test('applying notifies the recruiter; a status change notifies the seeker', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id, { title: 'Notify Me' });
    const seeker = await seekerWithResume({ name: 'Nia N' });
    const applied = await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });
    const applicationId = applied.body.application.id;

    const recruiterInbox = await eventually(
      async () => (await request(app).get('/api/notifications').set(auth(r.token))).body,
      (b) => b.items.length > 0
    );
    expect(recruiterInbox.unread).toBe(1);
    expect(recruiterInbox.items[0]).toMatchObject({
      type: 'APPLICATION_SUBMITTED',
      read: false,
      link: `/recruiter/jobs/${job.id}/applicants`
    });
    expect(recruiterInbox.items[0].body).toBe('Nia N applied to Notify Me');

    await request(app).patch(`/api/applications/${applicationId}/status`).set(auth(r.token)).send({ status: 'SHORTLISTED' });
    const seekerInbox = await eventually(
      async () => (await request(app).get('/api/notifications').set(auth(seeker.token))).body,
      (b) => b.items.length > 0
    );
    expect(seekerInbox.items[0]).toMatchObject({ type: 'APPLICATION_STATUS', link: `/seeker/applications/${applicationId}` });
    expect(seekerInbox.items[0].body).toContain('moved to SHORTLISTED');
  });

  test("unread count, mark some read, mark all read, and you cannot touch someone else's", async () => {
    const r = await createRecruiterWithCompany();
    const other = await createRecruiterWithCompany('Other');
    const job = await createJob(r.token, r.company.id);
    for (let i = 0; i < 2; i += 1) {
      const seeker = await seekerWithResume();
      await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });
    }
    await eventually(
      async () => Notification.countDocuments(),
      (n) => n === 2
    );

    const inbox = (await request(app).get('/api/notifications').set(auth(r.token))).body;
    expect(inbox.unread).toBe(2);
    expect((await request(app).get('/api/notifications/unread-count').set(auth(r.token))).body.unread).toBe(2);

    const stolen = await request(app)
      .post('/api/notifications/read')
      .set(auth(other.token))
      .send({ ids: [inbox.items[0].id] });
    expect(stolen.body.unread).toBe(0);
    expect((await request(app).get('/api/notifications/unread-count').set(auth(r.token))).body.unread).toBe(2);

    const one = await request(app)
      .post('/api/notifications/read')
      .set(auth(r.token))
      .send({ ids: [inbox.items[0].id] });
    expect(one.body.unread).toBe(1);
    const all = await request(app).post('/api/notifications/read').set(auth(r.token)).send({ all: true });
    expect(all.body.unread).toBe(0);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  test('deleting a user removes their bookmarks and notifications', async () => {
    const r = await createRecruiterWithCompany();
    const job = await createJob(r.token, r.company.id);
    const seeker = await seekerWithResume();
    await request(app).put(`/api/seekers/me/saved/${job.id}`).set(auth(seeker.token));
    await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });
    await eventually(
      async () => Notification.countDocuments(),
      (n) => n >= 1
    );

    const admin = await adminToken();
    await request(app).delete(`/api/admin/users/${r.user.id}`).set(auth(admin));
    await request(app).delete(`/api/admin/users/${seeker.user.id}`).set(auth(admin));
    expect([await SavedJob.countDocuments(), await Notification.countDocuments()]).toEqual([0, 0]);
  });
});
