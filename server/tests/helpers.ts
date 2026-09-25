import request from 'supertest';
import { app } from '../src/app';

export { app, request };

export interface TestUser {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerAndLogin(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const payload = {
    name: 'Test User',
    email: `user${Date.now()}${Math.random()}@example.com`,
    password: 'password123',
    role: 'JOB_SEEKER',
    ...overrides
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { token: res.body.token, user: res.body.user };
}

export async function createRecruiterWithCompany(companyName = 'Acme Corp') {
  const { token, user } = await registerAndLogin({ role: 'RECRUITER' });
  const companyRes = await request(app).post('/api/companies').set(auth(token)).send({ name: companyName, location: 'Remote' });
  return { token, user, company: companyRes.body.company as { id: string; name: string } };
}

export async function createJob(token: string, companyId: string, overrides: Record<string, unknown> = {}) {
  const payload = {
    title: 'Software Engineer',
    company: companyId,
    description: 'Build things',
    location: 'Remote',
    salaryMin: 50000,
    salaryMax: 90000,
    experienceRequired: 2,
    employmentType: 'FULL_TIME',
    requiredSkills: ['JavaScript'],
    ...overrides
  };
  const res = await request(app).post('/api/jobs').set(auth(token)).send(payload);
  return res.body.job as { id: string; title: string };
}

export function uploadDummyResume(token: string) {
  return request(app)
    .post('/api/seekers/me/resume')
    .set(auth(token))
    .attach('resume', Buffer.from('%PDF-1.4 dummy resume content'), { filename: 'resume.pdf', contentType: 'application/pdf' });
}

/** Seeds an ADMIN (never self-registrable) and returns a valid access token. */
export async function adminToken(email = 'admin@example.com'): Promise<string> {
  const { User } = await import('../src/models');
  const { hashPassword } = await import('../src/utils/password');
  await User.create({ name: 'Admin', email, password: await hashPassword('password123'), role: 'ADMIN' });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}
