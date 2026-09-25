import { RESUME_MAX_BYTES } from '@jobportal/shared';
import {
  API,
  PDF,
  adminToken,
  app,
  apply,
  auth,
  createJob,
  makeDocx,
  recruiterWithCompany,
  request,
  seeker,
  seekerWithResume,
  uploadResume
} from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

const binary = (res: request.Response) => res;
const download = (token: string, id: string) =>
  request(app)
    .get(`${API}/resumes/${id}/file`)
    .set(auth(token))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

describe('uploading', () => {
  test('a PDF -> 201; the type comes from the bytes, the client Content-Type is ignored', async () => {
    const s = await seeker();
    const res = await uploadResume(s.token, PDF, 'cv.pdf', 'text/html');
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/resumes/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ originalName: 'cv.pdf', mimeType: 'application/pdf', size: PDF.length, isCurrent: true });
    expect(JSON.stringify(res.body)).not.toMatch(/fileId|sha256/);

    const profile = await request(app).get(`${API}/users/me/profile`).set(auth(s.token));
    expect(profile.body.data.resume.id).toBe(res.body.data.id);
  });

  test('a real DOCX -> 201, and its text is extracted for matching', async () => {
    const s = await seeker();
    const res = await uploadResume(s.token, makeDocx(['Jane Doe', 'Skills: Kubernetes & Go']), 'jane.docx', 'application/octet-stream');
    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const { Resume } = await import('../src/models');
    const stored = await Resume.findById(res.body.data.id).select('+text').lean();
    expect(stored!.text).toContain('Skills: Kubernetes & Go');
  });

  test.each([
    ['an executable renamed to .pdf', Buffer.from('MZ\x90\x00 this is a windows executable'), 'resume.pdf'],
    ['a DOCX renamed to .pdf', makeDocx(['hi']), 'resume.pdf'],
    ['a PDF renamed to .docx', PDF, 'resume.docx'],
    ['a zip that is not a Word document', Buffer.from('PK\x03\x04 random zip content'), 'resume.docx'],
    ['a macro-enabled document', makeDocx(['hi'], { 'word/vbaProject.bin': 'macro' }), 'resume.docx'],
    ['an HTML file', Buffer.from('<html><script>alert(1)</script></html>'), 'resume.html'],
    ['a file with no extension', PDF, 'resume']
  ])('%s -> 415 UNSUPPORTED_MEDIA_TYPE', async (_label, bytes, name) => {
    const s = await seeker();
    const res = await uploadResume(s.token, bytes, name, 'application/pdf');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('an empty file -> 422', async () => {
    const s = await seeker();
    const res = await uploadResume(s.token, Buffer.alloc(0), 'empty.pdf');
    expect(res.status).toBe(422);
  });

  test('over 5 MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const s = await seeker();
    const big = Buffer.concat([PDF, Buffer.alloc(RESUME_MAX_BYTES)]);
    const res = await uploadResume(s.token, big, 'big.pdf');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('wrong field name -> 400; no file -> 400; not multipart -> 415', async () => {
    const s = await seeker();
    const wrongField = await request(app).post(`${API}/resumes`).set(auth(s.token)).attach('resume', PDF, 'cv.pdf');
    expect(wrongField.status).toBe(400);
    const noFile = await request(app).post(`${API}/resumes`).set(auth(s.token)).field('note', 'x');
    expect(noFile.status).toBe(400);
    const json = await request(app).post(`${API}/resumes`).set(auth(s.token)).send({ file: 'x' });
    expect(json.status).toBe(415);
  });

  test('path traversal and reserved characters are stripped from the filename', async () => {
    const s = await seeker();
    const res = await uploadResume(s.token, PDF, '../../etc/pass<wd>:|*?.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.originalName).toBe('passwd.pdf');
    const windows = await uploadResume(s.token, PDF, '..\\..\\windows\\cv.pdf');
    expect(windows.body.data.originalName).toBe('cv.pdf');
  });

  test('a malformed multipart body -> 400, never 500', async () => {
    const s = await seeker();
    const res = await uploadResume(s.token, PDF, 'sys"32\u0000evil.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  test('only job seekers upload', async () => {
    const r = await recruiterWithCompany();
    expect((await uploadResume(r.token)).status).toBe(403);
    expect((await request(app).post(`${API}/resumes`).attach('file', PDF, 'cv.pdf')).status).toBe(401);
  });
});

describe('downloading (authorisation)', () => {
  test('the owner downloads the exact bytes with safe headers', async () => {
    const s = await seekerWithResume();
    const res = binary(await download(s.token, s.resumeId));
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="resume\.pdf"/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('a recruiter of the company that received it may download it; a rival recruiter and other seekers get 404', async () => {
    const hiring = await recruiterWithCompany('Hiring');
    const rival = await recruiterWithCompany('Rival');
    const job = await createJob(hiring.token);
    const candidate = await seekerWithResume();
    const other = await seekerWithResume();
    const application = await apply(candidate.token, job.id);
    expect(application.resume!.id).toBe(candidate.resumeId);

    expect((await download(hiring.token, candidate.resumeId)).status).toBe(200);
    expect((await download(rival.token, candidate.resumeId)).status).toBe(404);
    expect((await download(other.token, candidate.resumeId)).status).toBe(404);
    expect((await request(app).get(`${API}/resumes/${candidate.resumeId}`).set(auth(rival.token))).status).toBe(404);
    expect((await download((await adminToken()).token, candidate.resumeId)).status).toBe(200);
  });

  test("a recruiter cannot reach a candidate's OTHER resumes, only the one sent to them", async () => {
    const hiring = await recruiterWithCompany();
    const job = await createJob(hiring.token);
    const candidate = await seekerWithResume();
    await apply(candidate.token, job.id);
    const newer = await uploadResume(candidate.token, PDF, 'newer.pdf');
    expect((await download(hiring.token, newer.body.data.id)).status).toBe(404);
    expect((await download(hiring.token, candidate.resumeId)).status).toBe(200);
  });

  test('unknown or malformed ids', async () => {
    const s = await seekerWithResume();
    expect((await download(s.token, '0'.repeat(24))).status).toBe(404);
    expect((await download(s.token, 'abc')).status).toBe(422);
  });
});

describe('replacing and deleting', () => {
  test('a replaced resume that no application used is deleted, bytes included', async () => {
    const s = await seekerWithResume();
    const next = await uploadResume(s.token, PDF, 'v2.pdf');
    expect((await request(app).get(`${API}/resumes`).set(auth(s.token))).body.data.map((r: { id: string }) => r.id)).toEqual([
      next.body.data.id
    ]);
    expect((await download(s.token, s.resumeId)).status).toBe(404);
  });

  test('a resume an application used survives replacement and deletion by its owner (recruiters still see it)', async () => {
    const hiring = await recruiterWithCompany();
    const job = await createJob(hiring.token);
    const s = await seekerWithResume();
    await apply(s.token, job.id);

    await uploadResume(s.token, PDF, 'v2.pdf');
    const list = await request(app).get(`${API}/resumes`).set(auth(s.token));
    expect(list.body.data.map((r: { originalName: string; isCurrent: boolean }) => [r.originalName, r.isCurrent])).toEqual([
      ['v2.pdf', true],
      ['resume.pdf', false]
    ]);

    await request(app).delete(`${API}/resumes/${s.resumeId}`).set(auth(s.token)).expect(204);
    expect((await request(app).get(`${API}/resumes`).set(auth(s.token))).body.data).toHaveLength(1);
    expect((await download(hiring.token, s.resumeId)).status).toBe(200);
  });

  test('deleting the current resume clears it from the profile; others cannot delete it', async () => {
    const s = await seekerWithResume();
    const other = await seekerWithResume();
    expect((await request(app).delete(`${API}/resumes/${s.resumeId}`).set(auth(other.token))).status).toBe(404);
    await request(app).delete(`${API}/resumes/${s.resumeId}`).set(auth(s.token)).expect(204);
    expect((await request(app).get(`${API}/users/me/profile`).set(auth(s.token))).body.data.resume).toBeNull();
  });
});
