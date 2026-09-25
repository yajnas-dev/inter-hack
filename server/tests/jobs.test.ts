import {
  API,
  adminToken,
  app,
  apply,
  auth,
  createJob,
  jobPayload,
  recruiterWithCompany,
  register,
  request,
  seekerWithResume
} from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

const ids = (res: request.Response) => (res.body.data as Array<{ id: string }>).map((j) => j.id);
const titles = (res: request.Response) => (res.body.data as Array<{ title: string }>).map((j) => j.title);

describe('creating jobs', () => {
  test('201 with Location; the company comes from the recruiter, never from the body', async () => {
    const r = await recruiterWithCompany('Northwind');
    const other = await recruiterWithCompany('Contoso');
    const res = await request(app)
      .post(`${API}/jobs`)
      .set(auth(r.token))
      .send({ ...jobPayload(), company: other.company.id });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/jobs/${res.body.data.id}`);
    expect(res.body.data.company).toMatchObject({ id: r.company.id, name: 'Northwind' });
    expect(res.body.data.applicantCount).toBe(0);
  });

  test('a recruiter without a company -> 422 COMPANY_REQUIRED', async () => {
    const r = await register({ role: 'RECRUITER' });
    const res = await request(app).post(`${API}/jobs`).set(auth(r.token)).send(jobPayload());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COMPANY_REQUIRED');
  });

  test('validation: every invalid field is reported at once', async () => {
    const r = await recruiterWithCompany();
    const res = await request(app)
      .post(`${API}/jobs`)
      .set(auth(r.token))
      .send({ ...jobPayload({ employmentType: 'GIG', salaryMin: -1 }), title: '' });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'employmentType', 'salaryMin']));
  });

  test('validation: cross-field rule salaryMax >= salaryMin (checked once the fields themselves are valid)', async () => {
    const r = await recruiterWithCompany();
    const res = await request(app)
      .post(`${API}/jobs`)
      .set(auth(r.token))
      .send(jobPayload({ salaryMin: 100, salaryMax: 50 }));
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { location: 'body', field: 'salaryMax', message: 'salaryMax must be greater than or equal to salaryMin' }
    ]);
  });

  test('only recruiters create jobs', async () => {
    const s = await register();
    expect((await request(app).post(`${API}/jobs`).set(auth(s.token)).send(jobPayload())).status).toBe(403);
    expect((await request(app).post(`${API}/jobs`).send(jobPayload())).status).toBe(401);
  });
});

describe('updating and deleting jobs (ownership by company)', () => {
  test('PATCH updates own job; the stored salary bounds are re-checked', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token, { salaryMin: 100, salaryMax: 200 });
    const ok = await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({ title: 'Staff Engineer' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toBe('Staff Engineer');

    const bad = await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({ salaryMin: 500 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].field).toBe('salaryMax');
  });

  test('an empty PATCH is rejected', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    expect((await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({})).status).toBe(422);
  });

  test("another company's recruiter cannot modify or delete the job (403)", async () => {
    const owner = await recruiterWithCompany('Owner Co');
    const intruder = await recruiterWithCompany('Intruder Co');
    const job = await createJob(owner.token);
    const patch = await request(app).patch(`${API}/jobs/${job.id}`).set(auth(intruder.token)).send({ title: 'Hacked' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
    expect((await request(app).delete(`${API}/jobs/${job.id}`).set(auth(intruder.token))).status).toBe(403);
    expect((await request(app).get(`${API}/jobs/${job.id}`)).body.data.title).toBe('Software Engineer');
  });

  test('closing via PATCH status hides the job from search but keeps it readable; reopening restores it', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({ status: 'CLOSED' }).expect(200);
    expect(ids(await request(app).get(`${API}/jobs`))).not.toContain(job.id);
    expect((await request(app).get(`${API}/jobs/${job.id}`)).body.data.status).toBe('CLOSED');
    await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({ status: 'OPEN' }).expect(200);
    expect(ids(await request(app).get(`${API}/jobs`))).toContain(job.id);
  });

  test('DELETE -> 204 when nobody applied; 409 JOB_HAS_APPLICATIONS otherwise (history is preserved)', async () => {
    const r = await recruiterWithCompany();
    const empty = await createJob(r.token);
    await request(app).delete(`${API}/jobs/${empty.id}`).set(auth(r.token)).expect(204);
    expect((await request(app).get(`${API}/jobs/${empty.id}`)).status).toBe(404);

    const popular = await createJob(r.token);
    const s = await seekerWithResume();
    await apply(s.token, popular.id);
    const res = await request(app).delete(`${API}/jobs/${popular.id}`).set(auth(r.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_HAS_APPLICATIONS');
  });

  test('renaming a job updates the title shown on its applications', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    const s = await seekerWithResume();
    const application = await apply(s.token, job.id);
    await request(app).patch(`${API}/jobs/${job.id}`).set(auth(r.token)).send({ title: 'Renamed Role' }).expect(200);
    const res = await request(app).get(`${API}/applications/${application.id}`).set(auth(s.token));
    expect(res.body.data.job.title).toBe('Renamed Role');
  });

  test("GET /users/me/jobs lists the company's jobs of every status with applicant counts", async () => {
    const r = await recruiterWithCompany();
    const a = await createJob(r.token, { title: 'Open role' });
    const b = await createJob(r.token, { title: 'Closed role' });
    await request(app).patch(`${API}/jobs/${b.id}`).set(auth(r.token)).send({ status: 'CLOSED' });
    const s = await seekerWithResume();
    await apply(s.token, a.id);
    await createJob((await recruiterWithCompany('Other')).token, { title: 'Not mine' });

    const res = await request(app).get(`${API}/users/me/jobs`).set(auth(r.token));
    expect(res.status).toBe(200);
    expect(titles(res).sort()).toEqual(['Closed role', 'Open role']);
    expect(res.body.data.find((j: { id: string }) => j.id === a.id).applicantCount).toBe(1);
    expect(res.body.meta).toMatchObject({ page: 1, total: 2, hasNextPage: false });

    const closedOnly = await request(app).get(`${API}/users/me/jobs?status=CLOSED`).set(auth(r.token));
    expect(titles(closedOnly)).toEqual(['Closed role']);
  });
});

describe('reading jobs', () => {
  test('detail includes the full company profile', async () => {
    const r = await recruiterWithCompany('Northwind');
    const job = await createJob(r.token);
    const res = await request(app).get(`${API}/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: job.id,
      description: 'Build and ship features.',
      company: { name: 'Northwind', location: 'Chennai' }
    });
  });

  test('unknown id -> 404; malformed id -> 422', async () => {
    expect((await request(app).get(`${API}/jobs/${'0'.repeat(24)}`)).status).toBe(404);
    const bad = await request(app).get(`${API}/jobs/not-an-id`);
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0]).toMatchObject({ location: 'params', field: 'id' });
  });

  test('similar jobs share a company or a skill', async () => {
    const r = await recruiterWithCompany();
    const base = await createJob(r.token, { requiredSkills: ['Go'] });
    const sibling = await createJob(r.token, { title: 'Sibling', requiredSkills: ['Rust'] });
    const other = await recruiterWithCompany('Other');
    const shared = await createJob(other.token, { title: 'Shares Go', requiredSkills: ['go'] });
    await createJob(other.token, { title: 'Unrelated', requiredSkills: ['COBOL'] });
    const res = await request(app).get(`${API}/jobs/${base.id}/similar`);
    expect(ids(res).sort()).toEqual([sibling.id, shared.id].sort());
  });

  test('facets count open jobs by location, skill and type', async () => {
    const r = await recruiterWithCompany();
    await createJob(r.token, { location: 'Chennai', requiredSkills: ['React'] });
    await createJob(r.token, { location: 'chennai', requiredSkills: ['react', 'Node.js'], employmentType: 'REMOTE' });
    const res = await request(app).get(`${API}/jobs/facets`);
    expect(res.body.data.totalOpen).toBe(2);
    expect(res.body.data.locations[0]).toMatchObject({ count: 2 });
    expect(res.body.data.skills.find((s: { name: string }) => s.name.toLowerCase() === 'react').count).toBe(2);
  });
});

describe('search and filtering', () => {
  async function seed() {
    const r = await recruiterWithCompany('Northwind');
    const other = await recruiterWithCompany('Contoso');
    const make = (token: string, o: Record<string, unknown>) => createJob(token, o);
    const jobs = {
      backend: await make(r.token, {
        title: 'Senior Backend Engineer',
        location: 'Chennai',
        requiredSkills: ['Node.js', 'MongoDB'],
        experienceRequired: 5,
        salaryMax: 250000,
        salaryMin: 150000
      }),
      frontend: await make(r.token, {
        title: 'Frontend Engineer',
        location: 'Bengaluru',
        requiredSkills: ['React', 'CSS'],
        experienceRequired: 2,
        salaryMax: 120000
      }),
      intern: await make(other.token, {
        title: 'Data Intern',
        location: 'Chennai',
        requiredSkills: ['SQL'],
        experienceRequired: 0,
        employmentType: 'INTERNSHIP',
        salaryMax: 20000,
        salaryMin: 10000
      }),
      remote: await make(other.token, {
        title: 'Remote React Developer',
        location: 'Remote',
        requiredSkills: ['React', 'TypeScript'],
        experienceRequired: 3,
        employmentType: 'REMOTE',
        salaryMax: 150000
      })
    };
    return { r, other, jobs };
  }

  test('title: every word must appear (case-insensitive)', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?title=engineer`)).sort()).toEqual([jobs.backend.id, jobs.frontend.id].sort());
    expect(ids(await request(app).get(`${API}/jobs?title=BACKEND%20senior`))).toEqual([jobs.backend.id]);
  });

  test('location: case-insensitive prefix', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?location=chen`)).sort()).toEqual([jobs.backend.id, jobs.intern.id].sort());
  });

  test('skills: any of a comma-separated list, case-insensitive', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?skills=react,sql`)).sort()).toEqual(
      [jobs.frontend.id, jobs.intern.id, jobs.remote.id].sort()
    );
  });

  test('experience: jobs requiring at most N years', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?experience=2`)).sort()).toEqual([jobs.frontend.id, jobs.intern.id].sort());
  });

  test('employmentType: one or several', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?employmentType=INTERNSHIP`))).toEqual([jobs.intern.id]);
    expect(ids(await request(app).get(`${API}/jobs?employmentType=INTERNSHIP,REMOTE`)).sort()).toEqual(
      [jobs.intern.id, jobs.remote.id].sort()
    );
  });

  test('filters combine with AND; company and minSalary filters', async () => {
    const { jobs, other } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?location=chennai&skills=node.js&experience=5`))).toEqual([jobs.backend.id]);
    expect(ids(await request(app).get(`${API}/jobs?company=${other.company.id}`)).sort()).toEqual([jobs.intern.id, jobs.remote.id].sort());
    expect(ids(await request(app).get(`${API}/jobs?minSalary=140000`)).sort()).toEqual([jobs.backend.id, jobs.remote.id].sort());
  });

  test('sort by salary (both directions) and by date', async () => {
    const { jobs } = await seed();
    expect(ids(await request(app).get(`${API}/jobs?sort=-salaryMax`))).toEqual([
      jobs.backend.id,
      jobs.remote.id,
      jobs.frontend.id,
      jobs.intern.id
    ]);
    expect(ids(await request(app).get(`${API}/jobs?sort=salaryMax`))).toEqual([
      jobs.intern.id,
      jobs.frontend.id,
      jobs.remote.id,
      jobs.backend.id
    ]);
    expect(ids(await request(app).get(`${API}/jobs`))).toEqual([jobs.remote.id, jobs.intern.id, jobs.frontend.id, jobs.backend.id]);
  });

  test('search input is escaped, never interpreted as a regex or operator', async () => {
    await seed();
    const res = await request(app).get(`${API}/jobs?location=${encodeURIComponent('.*')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    const op = await request(app).get(`${API}/jobs?title[$ne]=x`);
    expect(op.status).toBe(200); // unknown key under the flat query parser: ignored, not an operator
  });

  test('invalid filters are rejected with details, not silently ignored', async () => {
    const res = await request(app).get(`${API}/jobs?employmentType=GIG&experience=-1&postedWithin=5&sort=name&minSalary=abc`);
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field.split('.')[0]).sort()).toEqual(
      ['employmentType', 'experience', 'minSalary', 'postedWithin', 'sort'].sort()
    );
  });
});

describe('pagination', () => {
  async function seedMany(n: number) {
    const r = await recruiterWithCompany();
    for (let i = 0; i < n; i += 1)
      await createJob(r.token, { title: `Job ${String(i).padStart(2, '0')}`, salaryMax: 100000 + (i % 3) * 1000, salaryMin: 0 });
  }

  test('page/limit with totals in meta', async () => {
    await seedMany(7);
    const res = await request(app).get(`${API}/jobs?page=2&limit=3`);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 3, total: 7, totalPages: 3, hasNextPage: true });
    const last = await request(app).get(`${API}/jobs?page=3&limit=3`);
    expect(last.body.data).toHaveLength(1);
    expect(last.body.meta.hasNextPage).toBe(false);
  });

  test('limit is capped: 101 -> 422; 0 -> 422; page 0 -> 422', async () => {
    for (const q of ['limit=101', 'limit=0', 'page=0', 'limit=abc']) {
      expect((await request(app).get(`${API}/jobs?${q}`)).status).toBe(422);
    }
  });

  test.each(['-createdAt', 'createdAt', '-salaryMax', 'salaryMax'])(
    'cursor paging over sort %s visits every job exactly once',
    async (sort) => {
      await seedMany(11);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await request(app)
          .get(`${API}/jobs`)
          .query({ sort, limit: 4, ...(cursor && { cursor }) });
        expect(res.status).toBe(200);
        seen.push(...ids(res));
        cursor = res.body.meta.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(11);
    }
  );

  test('a tampered cursor, or one from another sort, -> 422', async () => {
    await seedMany(3);
    const first = await request(app).get(`${API}/jobs?limit=1`);
    const cursor = first.body.meta.nextCursor as string;
    expect((await request(app).get(`${API}/jobs`).query({ cursor: 'garbage' })).status).toBe(422);
    const mismatch = await request(app).get(`${API}/jobs`).query({ cursor, sort: '-salaryMax' });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.details[0].field).toBe('cursor');
  });
});

describe('admin moderation of jobs', () => {
  test('an admin can close any job and delete one that has applications', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    const s = await seekerWithResume();
    await apply(s.token, job.id);
    const admin = await adminToken();
    const closed = await request(app).patch(`${API}/admin/jobs/${job.id}`).set(auth(admin.token)).send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'CLOSED', applicantCount: 1 });
    await request(app).delete(`${API}/admin/jobs/${job.id}`).set(auth(admin.token)).expect(204);
    expect((await request(app).get(`${API}/applications`).set(auth(s.token))).body.data).toEqual([]);
  });
});
