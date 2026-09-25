import { expect, type APIRequestContext } from '@playwright/test';
import { PASSWORD, unique } from './helpers';

export interface World {
  recruiter: { name: string; email: string };
  seeker: { name: string; email: string };
  jobIds: string[];
  /** The job with applicants in every stage. */
  mainJobId: string;
  pending: string[];
}

const JOBS = [
  {
    title: 'Senior Backend Engineer',
    location: 'Pune',
    type: 'FULL_TIME',
    min: 1200000,
    max: 2400000,
    exp: 5,
    skills: ['Node.js', 'MongoDB', 'TypeScript', 'AWS']
  },
  {
    title: 'Frontend Developer',
    location: 'Bengaluru',
    type: 'FULL_TIME',
    min: 900000,
    max: 1800000,
    exp: 3,
    skills: ['React', 'TypeScript', 'CSS']
  },
  { title: 'Product Designer', location: 'Remote', type: 'REMOTE', min: 800000, max: 1600000, exp: 2, skills: ['Figma', 'Research'] },
  {
    title: 'QA Automation Contractor',
    location: 'Hyderabad',
    type: 'CONTRACT',
    min: 500000,
    max: 900000,
    exp: 2,
    skills: ['Playwright', 'CI']
  },
  { title: 'Data Analyst Intern', location: 'Pune', type: 'INTERNSHIP', min: 200000, max: 300000, exp: 0, skills: ['SQL', 'Excel'] },
  {
    title: 'DevOps Engineer',
    location: 'Mumbai',
    type: 'FULL_TIME',
    min: 1500000,
    max: 2800000,
    exp: 4,
    skills: ['Docker', 'Kubernetes', 'AWS']
  },
  { title: 'Customer Success Manager', location: 'Delhi', type: 'PART_TIME', min: 400000, max: 700000, exp: 1, skills: ['Communication'] },
  {
    title: 'Mobile Engineer',
    location: 'Remote',
    type: 'REMOTE',
    min: 1000000,
    max: 2000000,
    exp: 3,
    skills: ['React Native', 'TypeScript']
  }
];

const auth = async (request: APIRequestContext, name: string, role: 'JOB_SEEKER' | 'RECRUITER') => {
  const email = `${unique(name.split(' ')[0]?.toLowerCase() ?? 'u')}@example.com`;
  const res = await request.post('/api/v1/auth/register', { data: { name, email, password: PASSWORD, role } });
  expect(res.status()).toBe(201);
  const { data } = (await res.json()) as { data: { accessToken: string } };
  return { email, name, headers: { Authorization: `Bearer ${data.accessToken}` } };
};

const uploadResume = async (request: APIRequestContext, headers: Record<string, string>) => {
  const res = await request.post('/api/v1/resumes', {
    headers,
    multipart: { file: { name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture') } }
  });
  expect(res.ok()).toBe(true);
};

/**
 * A realistic dataset through the public API: one recruiter with eight jobs, one main job with candidates
 * in every stage plus three still waiting, and a "main" seeker with a filled-in profile and applications.
 */
export async function seedWorld(request: APIRequestContext): Promise<World> {
  const recruiter = await auth(request, 'Rita Recruiter', 'RECRUITER');
  await (
    await request.post('/api/v1/companies', {
      headers: recruiter.headers,
      data: {
        name: 'Northwind Labs',
        industry: 'Software',
        location: 'Pune',
        website: 'https://example.com',
        description: 'We build reliable developer tools.'
      }
    })
  ).json();

  const jobIds: string[] = [];
  for (const j of JOBS) {
    const res = await request.post('/api/v1/jobs', {
      headers: recruiter.headers,
      data: {
        title: j.title,
        description: `${j.title} at Northwind Labs.\n\nYou will own features end to end, work with a small team, and ship weekly.`,
        location: j.location,
        salaryMin: j.min,
        salaryMax: j.max,
        experienceRequired: j.exp,
        employmentType: j.type,
        requiredSkills: j.skills,
        vacancies: 2
      }
    });
    expect(res.status()).toBe(201);
    jobIds.push(((await res.json()) as { data: { id: string } }).data.id);
  }
  const mainJobId = jobIds[0] as string;

  const applyAndMove = async (name: string, path: string[]) => {
    const person = await auth(request, name, 'JOB_SEEKER');
    await request.patch('/api/v1/users/me/profile', {
      headers: person.headers,
      data: {
        headline: 'Software engineer',
        skills: ['Node.js', 'TypeScript'],
        experience: [{ title: 'Engineer', company: 'Somewhere', description: 'Built things.' }]
      }
    });
    await uploadResume(request, person.headers);
    const applied = await request.post('/api/v1/applications', {
      headers: person.headers,
      data: { jobId: mainJobId, coverNote: `Hello, I am ${name}.` }
    });
    expect(applied.status()).toBe(201);
    const id = ((await applied.json()) as { data: { id: string } }).data.id;
    for (const status of path) {
      const moved = await request.patch(`/api/v1/applications/${id}`, { headers: recruiter.headers, data: { status } });
      expect(moved.ok()).toBe(true);
    }
    return person;
  };

  await applyAndMove('Ava Shah', ['SHORTLISTED']);
  await applyAndMove('Ben Ortiz', ['SHORTLISTED', 'INTERVIEW']);
  await applyAndMove('Chloe Park', ['REJECTED']);
  await applyAndMove('Dev Patel', ['SHORTLISTED', 'INTERVIEW', 'SELECTED']);
  const pending = ['Esha Rao', 'Finn Blake', 'Gia Novak'];
  for (const name of pending) await applyAndMove(name, []);

  const sam = await auth(request, 'Sam Seeker', 'JOB_SEEKER');
  await request.patch('/api/v1/users/me/profile', {
    headers: sam.headers,
    data: {
      headline: 'Full-stack developer',
      phone: '+91 90000 00000',
      skills: ['React', 'Node.js', 'MongoDB'],
      education: [{ degree: 'B.Tech', institution: 'IIT', fieldOfStudy: 'Computer Science', startYear: 2016, endYear: 2020 }],
      experience: [{ title: 'Developer', company: 'Initech', description: 'Built internal tools.' }]
    }
  });
  await uploadResume(request, sam.headers);
  await request.post('/api/v1/applications', { headers: sam.headers, data: { jobId: jobIds[1] } });

  return {
    recruiter: { name: recruiter.name, email: recruiter.email },
    seeker: { name: sam.name, email: sam.email },
    jobIds,
    mainJobId,
    pending
  };
}
