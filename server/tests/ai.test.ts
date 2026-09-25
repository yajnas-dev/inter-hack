import {
  MatchProviderError,
  setMatchProvider,
  type AiMatchOutput,
  type MatchInput,
  type MatchProvider
} from '../src/modules/matching/provider';
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
  uploadResume
} from './helpers';
import { clearDatabase, closeDatabase, connect } from './setup';

beforeAll(connect);
afterEach(async () => {
  setMatchProvider(undefined);
  await clearDatabase();
});
afterAll(closeDatabase);

const aiResult: AiMatchOutput = {
  score: 86,
  summary: 'Strong fit.',
  matchedSkills: ['Node.js', 'MongoDB'],
  missingSkills: [],
  strengths: ['Built REST APIs'],
  gaps: [],
  suggestions: ['Quantify impact'],
  candidateYearsOfExperience: 5
};

class FakeProvider implements MatchProvider {
  readonly model = 'fake-model';
  calls: MatchInput[] = [];
  constructor(private readonly behaviour: () => Promise<AiMatchOutput>) {}
  analyze(input: MatchInput) {
    this.calls.push(input);
    return this.behaviour();
  }
}

async function scenario() {
  const r = await recruiterWithCompany('Acme');
  const job = await createJob(r.token, { requiredSkills: ['Node.js', 'MongoDB', 'AWS'], experienceRequired: 3 });
  const s = await seeker();
  await request(app)
    .patch(`${API}/users/me/profile`)
    .set(auth(s.token))
    .send({ skills: ['node.js', 'MongoDB', 'React'], totalExperienceYears: 4 });
  return { r, job, s };
}

const matchJob = (token: string, jobId: string) => request(app).post(`${API}/jobs/${jobId}/match`).set(auth(token));

describe('AI match analysis', () => {
  test('uses the AI provider when configured, validates and returns its analysis, then serves repeats from cache', async () => {
    const { job, s } = await scenario();
    await uploadResume(s.token);
    const fake = new FakeProvider(async () => aiResult);
    setMatchProvider(fake);

    const first = await matchJob(s.token, job.id);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      engine: 'ai',
      model: 'fake-model',
      score: 86,
      verdict: 'STRONG',
      cached: false,
      jobId: job.id
    });
    expect(first.body.data.experience).toEqual({ requiredYears: 3, candidateYears: 5 });
    expect(fake.calls[0]!.resume?.kind).toBe('pdf');
    expect(fake.calls[0]!.job.requiredSkills).toEqual(['Node.js', 'MongoDB', 'AWS']);

    const second = await matchJob(s.token, job.id);
    expect(second.body.data.cached).toBe(true);
    expect(fake.calls).toHaveLength(1);

    // Editing the profile changes the fingerprint: a fresh analysis.
    await request(app).patch(`${API}/users/me/profile`).set(auth(s.token)).send({ headline: 'Changed' });
    expect((await matchJob(s.token, job.id)).body.data.cached).toBe(false);
    expect(fake.calls).toHaveLength(2);
  });

  test('without an AI provider: the deterministic heuristic, clearly labelled', async () => {
    const { job, s } = await scenario();
    setMatchProvider(null);
    const res = await matchJob(s.token, job.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      engine: 'heuristic',
      matchedSkills: ['Node.js', 'MongoDB'],
      missingSkills: ['AWS'],
      experience: { requiredYears: 3, candidateYears: 4 },
      score: 77, // 0.7 * 2/3 + 0.3 * 1
      verdict: 'GOOD'
    });
    expect(res.body.data.warnings[0]).toMatch(/not configured/);
    expect(res.body.data.warnings.join(' ')).toMatch(/No resume/);
  });

  test.each([
    ['TIMEOUT', /timed out/],
    ['RATE_LIMITED', /busy/],
    ['INVALID_OUTPUT', /unusable/],
    ['REFUSED', /declined/]
  ] as const)('provider failure %s falls back to the heuristic with a warning (never a 500)', async (reason, warning) => {
    const { job, s } = await scenario();
    setMatchProvider(
      new FakeProvider(async () => {
        throw new MatchProviderError(reason, 'x');
      })
    );
    const res = await matchJob(s.token, job.id);
    expect(res.status).toBe(200);
    expect(res.body.data.engine).toBe('heuristic');
    expect(res.body.data.warnings[0]).toMatch(warning);
  });

  test('an unexpected exception inside the provider is also contained', async () => {
    const { job, s } = await scenario();
    setMatchProvider(
      new FakeProvider(async () => {
        throw new Error('boom');
      })
    );
    const res = await matchJob(s.token, job.id);
    expect(res.status).toBe(200);
    expect(res.body.data.engine).toBe('heuristic');
  });

  test('DOCX resume text reaches the provider and the heuristic', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token, { requiredSkills: ['Kubernetes', 'Go'] });
    const s = await seeker();
    await uploadResume(s.token, makeDocx(['Ran Kubernetes clusters for 3 years']), 'cv.docx');

    const fake = new FakeProvider(async () => aiResult);
    setMatchProvider(fake);
    await matchJob(s.token, job.id);
    expect(fake.calls[0]!.resume).toEqual({ kind: 'text', text: 'Ran Kubernetes clusters for 3 years' });

    setMatchProvider(null);
    const heuristic = await matchJob(s.token, job.id);
    expect(heuristic.body.data.matchedSkills).toEqual(['Kubernetes']);
  });

  test('an empty profile with no resume -> 422 PROFILE_INCOMPLETE', async () => {
    const r = await recruiterWithCompany();
    const job = await createJob(r.token);
    const s = await seeker();
    const res = await matchJob(s.token, job.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  test('unknown job -> 404; only job seekers use /jobs/:id/match', async () => {
    const { r, job, s } = await scenario();
    expect((await matchJob(s.token, '0'.repeat(24))).status).toBe(404);
    expect((await matchJob(r.token, job.id)).status).toBe(403);
    expect((await request(app).post(`${API}/jobs/${job.id}/match`)).status).toBe(401);
  });

  test("recruiters analyse an application with the resume that was sent; other companies can't", async () => {
    const { r, job, s } = await scenario();
    await uploadResume(s.token, PDF, 'sent.pdf');
    const application = await apply(s.token, job.id);
    await uploadResume(s.token, makeDocx(['a newer resume']), 'newer.docx');

    const fake = new FakeProvider(async () => aiResult);
    setMatchProvider(fake);
    const res = await request(app).post(`${API}/applications/${application.id}/match`).set(auth(r.token));
    expect(res.status).toBe(200);
    expect(res.body.data.engine).toBe('ai');
    expect(fake.calls[0]!.resume?.kind).toBe('pdf'); // the sent PDF, not the newer DOCX

    const rival = await recruiterWithCompany('Rival');
    expect((await request(app).post(`${API}/applications/${application.id}/match`).set(auth(rival.token))).status).toBe(404);
    expect((await request(app).post(`${API}/applications/${application.id}/match`).set(auth(s.token))).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`${API}/applications/${application.id}/match`)
          .set(auth((await adminToken()).token))
      ).status
    ).toBe(200);
  });
});
