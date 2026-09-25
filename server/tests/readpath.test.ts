import express from 'express';
import supertest from 'supertest';
import { connect, clearDatabase, closeDatabase } from './setup';
import { app, request, createRecruiterWithCompany, createJob, registerAndLogin, uploadDummyResume, auth } from './helpers';
import { createJsonCache } from '../src/infra/cache/json';
import { tokenize } from '../src/utils/tokenize';

beforeAll(async () => connect());
afterEach(async () => clearDatabase());
afterAll(async () => closeDatabase());

describe('keyset pagination (FR-03/04)', () => {
  test('cursor walks every job exactly once, newest first, and ends with a null cursor', async () => {
    const r = await createRecruiterWithCompany();
    for (let i = 0; i < 5; i += 1) await createJob(r.token, r.company.id, { title: `Engineer ${i}` });

    const seen = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await request(app)
        .get('/api/jobs')
        .query({ limit: 2, ...(cursor && { cursor }) });
      expect(res.status).toBe(200);
      if (pages === 0) expect(res.body.total).toBe(5);
      else expect(res.body.total).toBeUndefined();
      seen.push(...res.body.jobs.map((j: { title: string }) => j.title));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(['Engineer 4', 'Engineer 3', 'Engineer 2', 'Engineer 1', 'Engineer 0']);
  });

  test('a malformed cursor is a 400, not a 500', async () => {
    const res = await request(app).get('/api/jobs').query({ cursor: 'not-a-cursor' });
    expect(res.status).toBe(400);
  });

  test('list items carry the company without a populate and never leak search mirrors', async () => {
    const r = await createRecruiterWithCompany('Snapshot Co');
    await createJob(r.token, r.company.id);
    const [job] = (await request(app).get('/api/jobs')).body.jobs;
    expect(job.company.name).toBe('Snapshot Co');
    expect(job.company.id).toBe(r.company.id);
    for (const hidden of ['titleTokens', 'locationLower', 'requiredSkillsLower', 'companyName', 'description']) {
      expect(job[hidden]).toBeUndefined();
    }
  });
});

describe('title search', () => {
  test('all words must match, in any order, case-insensitively', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id, { title: 'Senior Node.js Backend Engineer' });
    await createJob(r.token, r.company.id, { title: 'Senior Frontend Engineer' });

    const both = await request(app).get('/api/jobs').query({ title: 'ENGINEER senior' });
    expect(both.body.jobs).toHaveLength(2);
    const narrow = await request(app).get('/api/jobs').query({ title: 'node.js backend' });
    expect(narrow.body.jobs.map((j: { title: string }) => j.title)).toEqual(['Senior Node.js Backend Engineer']);
  });

  test('tokenize keeps Node.js and C++ intact', () => {
    expect(tokenize('Sr. C++ / Node.js Dev')).toEqual(['sr', 'c++', 'node.js', 'dev']);
  });

  test('query-string operator injection is inert', async () => {
    const r = await createRecruiterWithCompany();
    await createJob(r.token, r.company.id);
    const res = await request(app).get('/api/jobs?employmentType[$ne]=FULL_TIME&title[$regex]=.*');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
  });
});

describe('company snapshot', () => {
  test('renaming a company updates its jobs in listings', async () => {
    const r = await createRecruiterWithCompany('Old Name');
    await createJob(r.token, r.company.id);

    const put = await request(app)
      .put(`/api/companies/${r.company.id}`)
      .set({ Authorization: `Bearer ${r.token}` })
      .send({ name: 'New Name' });
    expect(put.status).toBe(200);

    expect((await request(app).get('/api/jobs')).body.jobs[0].company.name).toBe('New Name');
  });
});

describe('serialised JSON cache', () => {
  function makeApp(ttl: number) {
    const cache = createJsonCache(ttl);
    let calls = 0;
    const a = express();
    a.get('/x', (req, res, next) => cache.respond(req, res, 'k', async () => ({ calls: ++calls, pad: 'x'.repeat(3000) })).catch(next));
    return { app: a, cache, calls: () => calls };
  }

  test('serves repeat hits without recomputing, with ETag/304 and pre-gzipped bodies', async () => {
    const t = makeApp(5000);
    const first = await supertest(t.app).get('/x').set('Accept-Encoding', 'identity');
    const second = await supertest(t.app).get('/x').set('Accept-Encoding', 'identity');
    expect(t.calls()).toBe(1);
    expect(second.body.calls).toBe(1);
    expect(second.headers['cache-control']).toMatch(/public, max-age=10/);

    const notModified = await supertest(t.app).get('/x').set('If-None-Match', first.headers.etag);
    expect(notModified.status).toBe(304);

    const gz = await supertest(t.app).get('/x').set('Accept-Encoding', 'gzip');
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.body.calls).toBe(1);
  });

  test('clear() forces a fresh computation; ttl 0 disables caching', async () => {
    const t = makeApp(5000);
    await supertest(t.app).get('/x');
    t.cache.clear();
    const res = await supertest(t.app).get('/x');
    expect(res.body.calls).toBe(2);

    const none = makeApp(0);
    await supertest(none.app).get('/x');
    await supertest(none.app).get('/x');
    expect(none.calls()).toBe(2);
  });
});

describe('application snapshots (join-free lists)', () => {
  test('lists render from the application itself and follow job/company edits', async () => {
    const r = await createRecruiterWithCompany('Snap Inc');
    const job = await createJob(r.token, r.company.id, { title: 'Original Title', location: 'Delhi' });
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER', name: 'Sanjana S' });
    await uploadDummyResume(seeker.token);
    await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });

    const mine = (await request(app).get('/api/applications/mine').set(auth(seeker.token))).body.applications[0];
    expect(mine.job).toMatchObject({
      id: job.id,
      title: 'Original Title',
      location: 'Delhi',
      company: { id: r.company.id, name: 'Snap Inc' }
    });

    const applicants = (await request(app).get(`/api/jobs/${job.id}/applications`).set(auth(r.token))).body.applications;
    expect(applicants[0].applicant).toMatchObject({ id: seeker.user.id, name: 'Sanjana S', email: seeker.user.email });
    expect(applicants[0].resumeSnapshot.originalName).toBe('resume.pdf');
    expect(applicants[0].resumeSnapshot.fileId).toBeUndefined();

    await request(app).put(`/api/jobs/${job.id}`).set(auth(r.token)).send({ title: 'Renamed Title' });
    await request(app).put(`/api/companies/${r.company.id}`).set(auth(r.token)).send({ name: 'Snap Corp' });

    const after = (await request(app).get('/api/applications/mine').set(auth(seeker.token))).body.applications[0];
    expect(after.job.title).toBe('Renamed Title');
    expect(after.job.company.name).toBe('Snap Corp');

    const detail = await request(app).get(`/api/applications/${after.id}`).set(auth(seeker.token));
    expect(detail.body.application.statusHistory).toHaveLength(1);
  });

  test('a recruiter who does not own the job cannot open its application', async () => {
    const owner = await createRecruiterWithCompany('Owner Co');
    const other = await createRecruiterWithCompany('Other Co');
    const job = await createJob(owner.token, owner.company.id);
    const seeker = await registerAndLogin({ role: 'JOB_SEEKER' });
    await uploadDummyResume(seeker.token);
    const applied = await request(app).post('/api/applications').set(auth(seeker.token)).send({ jobId: job.id });

    const id = applied.body.application.id;
    expect((await request(app).get(`/api/applications/${id}`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).get(`/api/applications/${id}`).set(auth(owner.token))).status).toBe(200);
  });
});
