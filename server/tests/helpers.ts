import zlib from 'node:zlib';
import request from 'supertest';
import { app } from '../src/app';

export { app, request };

export const API = '/api/v1';
export const PASSWORD = 'password123';

export interface TestUser {
  token: string;
  user: { id: string; name: string; email: string; role: string };
  cookie?: string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const unique = (prefix = 'u') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function register(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const payload = { name: 'Test User', email: `${unique()}@example.com`, password: PASSWORD, role: 'JOB_SEEKER', ...overrides };
  const res = await request(app).post(`${API}/auth/register`).send(payload);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken, user: res.body.data.user, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] };
}

export const seeker = (overrides: Record<string, unknown> = {}) => register({ role: 'JOB_SEEKER', ...overrides });

export async function recruiterWithCompany(name = 'Acme Corp') {
  const recruiter = await register({ role: 'RECRUITER' });
  const res = await request(app).post(`${API}/companies`).set(auth(recruiter.token)).send({ name, location: 'Chennai' });
  if (res.status !== 201) throw new Error(`company failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...recruiter, company: res.body.data as { id: string; name: string } };
}

export const jobPayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Software Engineer',
  description: 'Build and ship features.',
  location: 'Chennai',
  salaryMin: 50000,
  salaryMax: 90000,
  experienceRequired: 2,
  employmentType: 'FULL_TIME',
  requiredSkills: ['JavaScript'],
  ...overrides
});

export async function createJob(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post(`${API}/jobs`).set(auth(token)).send(jobPayload(overrides));
  if (res.status !== 201) throw new Error(`job failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; title: string; company: { id: string } };
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF');

export function uploadResume(token: string, file: Buffer = PDF, filename = 'resume.pdf', contentType = 'application/pdf') {
  return request(app).post(`${API}/resumes`).set(auth(token)).attach('file', file, { filename, contentType });
}

/** A seeker with a resume on file, ready to apply. */
export async function seekerWithResume(overrides: Record<string, unknown> = {}) {
  const s = await seeker(overrides);
  const res = await uploadResume(s.token);
  if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...s, resumeId: res.body.data.id as string };
}

export async function apply(token: string, jobId: string) {
  const res = await request(app).post(`${API}/applications`).set(auth(token)).send({ jobId });
  if (res.status !== 201) throw new Error(`apply failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; status: string; resume?: { id: string } };
}

/** Seeds an ADMIN (never self-registrable) and returns a valid access token. */
export async function adminToken(email = `${unique('admin')}@example.com`): Promise<{ token: string; id: string }> {
  const { User } = await import('../src/models');
  const { hashPassword } = await import('../src/utils/password');
  const admin = await User.create({ name: 'Admin', email, password: await hashPassword(PASSWORD), role: 'ADMIN' });
  const res = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  return { token: res.body.data.accessToken, id: String(admin._id) };
}

/** A minimal but real DOCX (zip with word/document.xml), built in memory. */
export function makeDocx(paragraphs: string[], extraEntries: Record<string, string> = {}): Buffer {
  const xml = `<?xml version="1.0"?><w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  const entries = { '[Content_Types].xml': '<Types/>', 'word/document.xml': xml, ...extraEntries };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content);
    const data = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}
