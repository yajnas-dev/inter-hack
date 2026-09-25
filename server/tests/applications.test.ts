import { API, adminToken, app, apply, auth, createJob, recruiterWithCompany, request, seeker, seekerWithResume } from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

async function world() {
  const hiring = await recruiterWithCompany('Hiring Co');
  const rival = await recruiterWithCompany('Rival Co');
  const job = await createJob(hiring.token, { requiredSkills: ['Node.js', 'MongoDB'] });
  const candidate = await seekerWithResume();
  const bystander = await seekerWithResume();
  return { hiring, rival, job, candidate, bystander };
}

const move = (token: string, id: string, status: string) =>
  request(app).patch(`${API}/applications/${id}`).set(auth(token)).send({ status });

describe('applying', () => {
  test('201 with Location, APPLIED status, the resume that was sent and the first history entry', async () => {
    const { job, candidate } = await world();
    const res = await request(app).post(`${API}/applications`).set(auth(candidate.token)).send({ jobId: job.id, coverNote: 'Hi' });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/applications/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ status: 'APPLIED', coverNote: 'Hi', job: { id: job.id }, resume: { id: candidate.resumeId } });
    expect(res.body.data.statusHistory).toHaveLength(1);
  });

  test('without a resume -> 422 RESUME_REQUIRED', async () => {
    const { job } = await world();
    const s = await seeker();
    const res = await request(app).post(`${API}/applications`).set(auth(s.token)).send({ jobId: job.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RESUME_REQUIRED');
  });

  test('a second application to the same job -> 409 DUPLICATE_APPLICATION', async () => {
    const { job, candidate } = await world();
    await apply(candidate.token, job.id);
    const res = await request(app).post(`${API}/applications`).set(auth(candidate.token)).send({ jobId: job.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_APPLICATION');
  });

  test('concurrent duplicate submissions: exactly one wins (unique index)', async () => {
    const { job, candidate } = await world();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post(`${API}/applications`).set(auth(candidate.token)).send({ jobId: job.id }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  test('closed job -> 409 JOB_CLOSED; unknown job -> 404', async () => {
    const { hiring, job, candidate } = await world();
    await request(app).patch(`${API}/jobs/${job.id}`).set(auth(hiring.token)).send({ status: 'CLOSED' });
    const closed = await request(app).post(`${API}/applications`).set(auth(candidate.token)).send({ jobId: job.id });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('JOB_CLOSED');
    expect(
      (
        await request(app)
          .post(`${API}/applications`)
          .set(auth(candidate.token))
          .send({ jobId: '0'.repeat(24) })
      ).status
    ).toBe(404);
  });

  test('only job seekers apply', async () => {
    const { hiring, job } = await world();
    expect((await request(app).post(`${API}/applications`).set(auth(hiring.token)).send({ jobId: job.id })).status).toBe(403);
  });
});

describe('who sees which application (IDOR)', () => {
  test('GET /applications is scoped to the caller: own for seekers, own company for recruiters, all for admins', async () => {
    const { hiring, rival, job, candidate, bystander } = await world();
    const rivalJob = await createJob(rival.token);
    const a1 = await apply(candidate.token, job.id);
    const a2 = await apply(bystander.token, rivalJob.id);

    const list = async (token: string) =>
      (await request(app).get(`${API}/applications`).set(auth(token))).body.data.map((a: { id: string }) => a.id);
    expect(await list(candidate.token)).toEqual([a1.id]);
    expect(await list(bystander.token)).toEqual([a2.id]);
    expect(await list(hiring.token)).toEqual([a1.id]);
    expect(await list(rival.token)).toEqual([a2.id]);
    expect((await list((await adminToken()).token)).sort()).toEqual([a1.id, a2.id].sort());
  });

  test('a filter cannot widen the scope: a rival recruiter filtering by our job id sees nothing', async () => {
    const { rival, job, candidate } = await world();
    await apply(candidate.token, job.id);
    const res = await request(app).get(`${API}/applications?jobId=${job.id}`).set(auth(rival.token));
    expect(res.body.data).toEqual([]);
  });

  test("another seeker or another company's recruiter gets 404 for an application id (existence not revealed)", async () => {
    const { rival, job, candidate, bystander } = await world();
    const a = await apply(candidate.token, job.id);
    for (const token of [bystander.token, rival.token]) {
      const res = await request(app).get(`${API}/applications/${a.id}`).set(auth(token));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await request(app).get(`${API}/applications/${a.id}`).set(auth(candidate.token))).status).toBe(200);
  });

  test("a rival recruiter cannot list our job's applicants or move them", async () => {
    const { rival, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    expect((await request(app).get(`${API}/jobs/${job.id}/applications`).set(auth(rival.token))).status).toBe(403);
    expect((await move(rival.token, a.id, 'SHORTLISTED')).status).toBe(404);
  });

  test('the applicant cannot change their own status', async () => {
    const { job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    expect((await move(candidate.token, a.id, 'SELECTED')).status).toBe(403);
  });
});

describe('status workflow', () => {
  test('APPLIED -> SHORTLISTED -> INTERVIEW -> SELECTED, with history and the allowed next steps', async () => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    let res = await move(hiring.token, a.id, 'SHORTLISTED');
    expect(res.status).toBe(200);
    expect(res.body.data.allowedNextStatuses).toEqual(['INTERVIEW', 'REJECTED']);
    res = await move(hiring.token, a.id, 'INTERVIEW');
    res = await move(hiring.token, a.id, 'SELECTED');
    expect(res.body.data.status).toBe('SELECTED');
    expect(res.body.data.allowedNextStatuses).toEqual([]);
    expect(res.body.data.statusHistory.map((h: { status: string }) => h.status)).toEqual([
      'APPLIED',
      'SHORTLISTED',
      'INTERVIEW',
      'SELECTED'
    ]);

    const seen = await request(app).get(`${API}/applications/${a.id}`).set(auth(candidate.token));
    expect(seen.body.data.status).toBe('SELECTED');
    expect(seen.body.data.allowedNextStatuses).toBeUndefined();
  });

  test.each([
    [[], 'INTERVIEW'],
    [[], 'SELECTED'],
    [['SHORTLISTED'], 'APPLIED'],
    [['SHORTLISTED', 'INTERVIEW', 'SELECTED'], 'REJECTED'],
    [['REJECTED'], 'SHORTLISTED'],
    [[], 'APPLIED']
  ])('after %j, moving to %s -> 409 INVALID_STATUS_TRANSITION', async (path, target) => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    for (const step of path) await move(hiring.token, a.id, step).expect(200);
    const res = await move(hiring.token, a.id, target);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('REJECTED is reachable from APPLIED, SHORTLISTED and INTERVIEW', async () => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    await move(hiring.token, a.id, 'SHORTLISTED').expect(200);
    await move(hiring.token, a.id, 'INTERVIEW').expect(200);
    expect((await move(hiring.token, a.id, 'REJECTED')).body.data.status).toBe('REJECTED');
  });

  test('two reviewers racing: one move wins, the other gets 409', async () => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    const [x, y] = await Promise.all([move(hiring.token, a.id, 'SHORTLISTED'), move(hiring.token, a.id, 'REJECTED')]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  test('unknown status value -> 422', async () => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    expect((await move(hiring.token, a.id, 'HIRED')).status).toBe(422);
  });

  test('status changes notify the applicant; new applications notify the recruiter', async () => {
    const { hiring, job, candidate } = await world();
    const a = await apply(candidate.token, job.id);
    await move(hiring.token, a.id, 'SHORTLISTED');
    await new Promise((r) => setTimeout(r, 100)); // listeners are async
    const mine = await request(app).get(`${API}/notifications`).set(auth(candidate.token));
    expect(mine.body.data[0].body).toMatch(/SHORTLISTED/);
    expect(mine.body.meta.unread).toBe(1);
    const theirs = await request(app).get(`${API}/notifications/unread-count`).set(auth(hiring.token));
    expect(theirs.body.data.unread).toBe(1);
    const marked = await request(app).patch(`${API}/notifications`).set(auth(candidate.token)).send({ all: true });
    expect(marked.body.data.unread).toBe(0);
  });
});

describe("the hiring company's tools", () => {
  test('applicants of a job, filterable by stage, with skill overlap and paging meta', async () => {
    const { hiring, job, candidate, bystander } = await world();
    await request(app)
      .patch(`${API}/users/me/profile`)
      .set(auth(candidate.token))
      .send({ skills: ['node.js', 'Go'] });
    const a = await apply(candidate.token, job.id);
    await apply(bystander.token, job.id);
    await move(hiring.token, a.id, 'SHORTLISTED');

    const all = await request(app).get(`${API}/jobs/${job.id}/applications`).set(auth(hiring.token));
    expect(all.body.meta).toMatchObject({ total: 2, page: 1 });
    const mine = all.body.data.find((x: { id: string }) => x.id === a.id);
    expect(mine).toMatchObject({ matchCount: 1, matchTotal: 2, resume: { originalName: 'resume.pdf' } });

    const shortlisted = await request(app).get(`${API}/jobs/${job.id}/applications?status=SHORTLISTED`).set(auth(hiring.token));
    expect(shortlisted.body.data.map((x: { id: string }) => x.id)).toEqual([a.id]);
  });

  test("notes are private to the hiring company; the applicant's profile is visible to it", async () => {
    const { hiring, rival, job, candidate } = await world();
    await request(app)
      .patch(`${API}/users/me/profile`)
      .set(auth(candidate.token))
      .send({ headline: 'Backend dev', skills: ['Node.js'] });
    const a = await apply(candidate.token, job.id);

    const note = await request(app).post(`${API}/applications/${a.id}/notes`).set(auth(hiring.token)).send({ text: 'Strong API design' });
    expect(note.status).toBe(201);
    expect((await request(app).get(`${API}/applications/${a.id}/notes`).set(auth(hiring.token))).body.data[0].text).toBe(
      'Strong API design'
    );
    expect((await request(app).get(`${API}/applications/${a.id}/notes`).set(auth(candidate.token))).status).toBe(403);
    expect((await request(app).get(`${API}/applications/${a.id}/notes`).set(auth(rival.token))).status).toBe(404);
    expect(JSON.stringify((await request(app).get(`${API}/applications/${a.id}`).set(auth(candidate.token))).body)).not.toContain(
      'Strong API design'
    );

    const profile = await request(app).get(`${API}/applications/${a.id}/applicant`).set(auth(hiring.token));
    expect(profile.body.data).toMatchObject({ headline: 'Backend dev', skills: ['Node.js'] });
    expect((await request(app).get(`${API}/applications/${a.id}/applicant`).set(auth(rival.token))).status).toBe(404);
  });

  test('recruiter dashboard counts only its own company', async () => {
    const { hiring, rival, job, candidate, bystander } = await world();
    const a = await apply(candidate.token, job.id);
    await apply(bystander.token, (await createJob(rival.token)).id);
    await move(hiring.token, a.id, 'SHORTLISTED');
    const res = await request(app).get(`${API}/users/me/dashboard`).set(auth(hiring.token));
    expect(res.body.data).toMatchObject({
      jobs: { open: 1, closed: 0 },
      totalApplicants: 1,
      applicantsByStatus: { SHORTLISTED: 1, APPLIED: 0 }
    });
  });
});
