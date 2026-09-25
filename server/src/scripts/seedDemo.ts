/**
 * Demo dataset: a large, realistic, deterministic database with 3 known login accounts.
 *
 *   npm run seed:demo -w server -- --reset [--scale=small|demo|large]
 *
 * It DROPS every collection in the target database first (that is what --reset means) and refuses to run on a
 * non-empty database without it. The target is MONGO_URI, so point it explicitly, for example at Atlas:
 *   MONGO_URI="mongodb+srv://user:pass@cluster/job_portal" npm run seed:demo -w server -- --reset
 *
 * Only the three demo accounts can log in: every other seeded account gets a random password nobody knows.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES, type ApplicationStatus, type EmploymentType } from '@jobportal/shared';
import { env } from '../config/env';
import { connectDB, disconnectDB, ensureIndexes } from '../infra/db';
import {
  Application,
  Company,
  Job,
  JobSeekerProfile,
  MatchAnalysis,
  Notification,
  RecruiterProfile,
  RefreshToken,
  Resume,
  SavedJob,
  User
} from '../models';
import { applicationSnapshots } from '../migrations/002-application-snapshots';
import { jobSnapshots } from '../migrations/001-job-snapshots';
import { resumeDocuments } from '../migrations/003-resume-documents';
import { tokenize } from '../utils/tokenize';
import {
  BENEFITS,
  CITIES,
  CITY_WEIGHTS,
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  DEGREES,
  EMPLOYER_NAMES,
  FAMILIES,
  FIRST_NAMES,
  INDUSTRIES,
  INSTITUTIONS,
  LAST_NAMES,
  NOTE_TEXTS,
  type Family
} from './demo/content';
import { makeDocx, makePdf } from './demo/files';

// ---- configuration ---------------------------------------------------------------------------------

const SCALES = {
  small: { companies: 40, seekers: 400, jobs: 600, applications: 2_500 },
  demo: { companies: 400, seekers: 6_000, jobs: 8_000, applications: 40_000 },
  large: { companies: 800, seekers: 15_000, jobs: 20_000, applications: 100_000 }
} as const;

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const scaleName = (args.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 'demo') as keyof typeof SCALES;
if (!(scaleName in SCALES)) throw new Error(`Unknown scale "${scaleName}" (small | demo | large)`);
const SCALE = SCALES[scaleName];

const DEMO = {
  password: process.env.DEMO_PASSWORD ?? 'Demo@12345',
  seeker: { name: 'Aarav Sharma', email: 'demo.seeker@example.com' },
  recruiter: { name: 'Riya Menon', email: 'demo.recruiter@example.com' },
  admin: { name: 'Demo Admin', email: 'demo.admin@example.com' },
  company: 'Northwind Labs',
  companyJobs: 80
} as const;

const DAY = 86_400_000;
const NOW = Date.now();

// ---- deterministic randomness -----------------------------------------------------------------------

let seed = 20_260_926;
const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number): boolean => rand() < p;
const at = <T>(arr: readonly T[], i: number): T => arr[i] as T;
const pick = <T>(arr: readonly T[]): T => at(arr, Math.floor(rand() * arr.length));

function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= at(weights, i);
    if (r <= 0) return at(items, i);
  }
  return at(items, items.length - 1);
}

function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0] as T);
  return out;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const pad = (n: number): string => String(n).padStart(5, '0');
const daysAgo = (d: number): Date => new Date(NOW - d * DAY);

const FAMILY_WEIGHTS = {
  backend: 20,
  frontend: 15,
  mobile: 6,
  data: 12,
  devops: 8,
  qa: 6,
  design: 6,
  product: 7,
  marketing: 8,
  business: 12
} as Record<string, number>;
const pickFamily = (): Family =>
  weighted(
    FAMILIES,
    FAMILIES.map((f) => FAMILY_WEIGHTS[f.key] ?? 5)
  );
const pickCity = (): string => weighted(CITIES, CITY_WEIGHTS);
const pickHubCity = (): string =>
  weighted(
    CITIES.filter((c) => c !== 'Remote'),
    CITY_WEIGHTS.filter((_, i) => at(CITIES, i) !== 'Remote')
  );

const log = (msg: string): void => console.log(`  ${msg}`);

// ---- generators ---------------------------------------------------------------------------------------

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

function levelPrefix(exp: number, type: EmploymentType): string {
  if (type === 'INTERNSHIP') return '';
  if (exp === 0) return 'Associate';
  if (exp <= 2) return chance(0.4) ? 'Junior' : '';
  if (exp <= 5) return exp >= 4 && chance(0.6) ? 'Senior' : '';
  if (exp <= 8) return pick(['Senior', 'Lead']);
  return pick(['Principal', 'Staff', 'Lead']);
}

function describeJob(j: {
  title: string;
  company: string;
  family: Family;
  skills: string[];
  location: string;
  exp: number;
  type: EmploymentType;
}): string {
  const [a, b, c] = [j.skills[0] ?? 'modern tooling', j.skills[1] ?? 'best practices', j.skills[2] ?? 'analytics'];
  const fill = (s: string) => s.replace('{a}', a).replace('{b}', b).replace('{c}', c);
  const team = pick(j.family.teams);
  const where = j.location === 'Remote' ? 'from anywhere in India' : `from our ${j.location} office (with flexible hybrid days)`;
  const duties = sample(j.family.duties, Math.min(j.family.duties.length, int(3, 5)));
  const wants = [
    j.exp > 0
      ? `${j.exp}+ years of relevant professional experience`
      : 'A strong foundation and curiosity; prior projects or internships are a plus',
    `Hands-on experience with ${j.skills.slice(0, 3).join(', ')}`,
    ...(j.skills.length > 3 ? [`Familiarity with ${j.skills.slice(3).join(', ')} is a bonus`] : []),
    'Clear written and spoken communication, and a habit of asking good questions'
  ];
  return [
    `${j.company} is hiring a ${j.title} for our ${team} team, working ${where}. You will join a small, product-focused group that designs, builds and ships things customers use every day.`,
    '',
    'What you will do',
    ...duties.map((d) => `• ${fill(d)}`),
    '',
    'What we are looking for',
    ...wants.map((w) => `• ${w}`),
    '',
    `What we offer${j.type === 'INTERNSHIP' ? ' (internship)' : ''}`,
    ...sample(BENEFITS, 4).map((x) => `• ${x}`)
  ].join('\n');
}

interface Built {
  users: Doc[];
  companies: Doc[];
  recruiterProfiles: Doc[];
  seekerProfiles: Doc[];
  resumes: Doc[];
  resumeFiles: Doc[];
  resumeChunks: Doc[];
  jobs: Doc[];
  applications: Doc[];
  saved: Doc[];
  notifications: Doc[];
}

async function build(): Promise<Built> {
  const out: Built = {
    users: [],
    companies: [],
    recruiterProfiles: [],
    seekerProfiles: [],
    resumes: [],
    resumeFiles: [],
    resumeChunks: [],
    jobs: [],
    applications: [],
    saved: [],
    notifications: []
  };
  const unusable = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);
  const demoHash = await bcrypt.hash(DEMO.password, env.bcryptRounds);
  const emailSeen = new Set<string>();
  const nameOf = (): string => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const emailOf = (name: string, i: number): string => {
    const e = `${slug(name.split(' ')[0] as string)}.${slug(name.split(' ')[1] as string)}.${i}@example.com`;
    emailSeen.add(e);
    return e;
  };

  // ---- admin -------------------------------------------------------------------------------------------
  out.users.push({
    _id: new Types.ObjectId(),
    name: DEMO.admin.name,
    email: DEMO.admin.email,
    password: demoHash,
    role: 'ADMIN',
    isActive: true,
    createdAt: daysAgo(200),
    updatedAt: daysAgo(1),
    lastLoginAt: daysAgo(0)
  });

  // ---- companies and their recruiters -----------------------------------------------------------------------
  interface Co {
    company: Doc;
    recruiter: Doc;
    families: Family[];
    city: string;
    weight: number;
    isDemo: boolean;
  }
  const cos: Co[] = [];
  const usedNames = new Set<string>([DEMO.company]);
  for (let i = 0; i < SCALE.companies; i += 1) {
    const isDemo = i === 0;
    let name: string = DEMO.company;
    if (!isDemo) {
      do name = `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)}`;
      while (usedNames.has(name));
      usedNames.add(name);
    }
    const city = isDemo ? 'Chennai' : pickHubCity();
    const families = isDemo
      ? FAMILIES.filter((f) => ['backend', 'frontend', 'data', 'devops', 'qa', 'design', 'product'].includes(f.key))
      : sample(
          FAMILIES.map((f) => f),
          int(1, 3)
        );
    if (!isDemo) {
      // Weight companies towards the popular families so tech roles dominate, like a real board.
      families.sort(() => rand() - 0.5);
    }
    const recruiterName = isDemo ? DEMO.recruiter.name : nameOf();
    const createdAt = daysAgo(isDemo ? 140 : 125 + rand() * 60);
    const recruiterId = new Types.ObjectId();
    const companyId = new Types.ObjectId();
    const industry = isDemo ? 'Software' : pick(INDUSTRIES);
    const recruiter: Doc = {
      _id: recruiterId,
      name: recruiterName,
      email: isDemo ? DEMO.recruiter.email : emailOf(recruiterName, i),
      password: isDemo ? demoHash : unusable,
      role: 'RECRUITER',
      isActive: isDemo || !chance(0.03),
      createdAt,
      updatedAt: createdAt,
      ...(isDemo && { lastLoginAt: daysAgo(0) })
    };
    const company: Doc = {
      _id: companyId,
      name,
      nameLower: name.toLowerCase(),
      description: `${name} builds ${industry.toLowerCase()} products for growing businesses. Founded in ${int(2008, 2022)}, we are a team of about ${pick([12, 25, 40, 80, 150, 300, 600])} people working across ${city} and ${pickHubCity()}, with a culture of clear writing, small teams and shipping often.`,
      website: `https://www.${slug(name)}.example.com`,
      industry,
      location: city,
      createdBy: recruiterId,
      createdAt,
      updatedAt: createdAt
    };
    out.users.push(recruiter);
    out.companies.push(company);
    out.recruiterProfiles.push({
      _id: new Types.ObjectId(),
      user: recruiterId,
      company: companyId,
      designation: pick(['Talent Acquisition Lead', 'Hiring Manager', 'HR Business Partner', 'Head of People', 'Recruiter']),
      phone: `+91 00000 ${pad(int(0, 99999))}`,
      createdAt,
      updatedAt: createdAt
    });
    cos.push({ company, recruiter, families, city, weight: isDemo ? 0 : 0.3 + rand() ** 2 * 3, isDemo });
  }

  // ---- jobs --------------------------------------------------------------------------------------------------
  const perCompany = new Map<Co, number>();
  const demoCo = cos[0] as Co;
  perCompany.set(demoCo, DEMO.companyJobs);
  const others = cos.slice(1);
  for (const co of others) perCompany.set(co, 1);
  let remaining = SCALE.jobs - DEMO.companyJobs - others.length;
  const weights = others.map((c) => c.weight);
  while (remaining > 0) {
    const co = weighted(others, weights);
    perCompany.set(co, (perCompany.get(co) ?? 0) + 1);
    remaining -= 1;
  }

  const TYPE_WEIGHTS = [60, 8, 10, 10, 12]; // FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP, REMOTE
  const TYPE_ORDER: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'];
  const EXP_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
  const EXP_WEIGHTS = [8, 14, 16, 16, 12, 12, 8, 5, 4, 3, 2];

  let demoIndex = 0;
  for (const [co, count] of perCompany) {
    for (let k = 0; k < count; k += 1) {
      const family = pick(co.families);
      const type: EmploymentType = co.isDemo
        ? at(TYPE_ORDER, demoIndex % 5 === 0 ? int(0, 4) : weighted([0, 1, 2, 3, 4], TYPE_WEIGHTS))
        : weighted(TYPE_ORDER, TYPE_WEIGHTS);
      const exp = type === 'INTERNSHIP' ? 0 : weighted(EXP_CHOICES, EXP_WEIGHTS);
      const titleBase = pick(family.titles);
      const prefix = levelPrefix(exp, type);
      const title = `${prefix ? `${prefix} ` : ''}${type === 'INTERNSHIP' ? `${titleBase} Intern` : titleBase}`;
      const skills = sample(family.skills, int(4, 7));
      const location = type === 'REMOTE' ? 'Remote' : chance(0.6) ? co.city : pickCity();
      const mult = type === 'PART_TIME' ? 0.5 : type === 'CONTRACT' ? 1.15 : 1;
      const base =
        type === 'INTERNSHIP' ? 180_000 + rand() * 240_000 : family.lpa * 100_000 * (1 + 0.22 * exp) * (0.85 + rand() * 0.35) * mult;
      const salaryMin = Math.max(10_000, Math.round(base / 10_000) * 10_000);
      const salaryMax = Math.round((salaryMin * (1.25 + rand() * 0.45)) / 10_000) * 10_000;
      const recent = co.isDemo && demoIndex < 6; // a few brand-new postings for the demo recruiter
      const ageDays = recent ? rand() * 3 : rand() ** 1.6 * 120;
      const createdAt = daysAgo(ageDays);
      const closed = !recent && (co.isDemo ? demoIndex % 9 === 4 : chance(0.13));
      out.jobs.push({
        _id: new Types.ObjectId(),
        title,
        company: co.company._id,
        companyName: co.company.name as string,
        postedBy: co.recruiter._id,
        description: describeJob({ title, company: co.company.name as string, family, skills, location, exp, type }),
        location,
        salaryMin,
        salaryMax,
        requiredSkills: skills,
        experienceRequired: exp,
        employmentType: type,
        status: closed ? 'CLOSED' : 'OPEN',
        vacancies: weighted([1, 2, 4, 10], [55, 20, 15, 10]),
        locationLower: location.toLowerCase(),
        requiredSkillsLower: skills.map((s) => s.toLowerCase()),
        titleTokens: tokenize(title),
        createdAt,
        updatedAt: closed ? new Date(Math.min(NOW, createdAt.getTime() + int(20, 45) * DAY)) : createdAt
      });
      if (co.isDemo) demoIndex += 1;
    }
  }

  // ---- job seekers (profiles and resumes) --------------------------------------------------------------------------
  interface Seeker {
    user: Doc;
    profile: Doc;
    resumeId: Types.ObjectId | null;
    isDemo: boolean;
  }
  const seekers: Seeker[] = [];
  for (let i = 0; i < SCALE.seekers; i += 1) {
    const isDemo = i === 0;
    const name = isDemo ? DEMO.seeker.name : nameOf();
    const family = isDemo ? (FAMILIES[0] as Family) : pickFamily();
    const exp = isDemo ? 4 : weighted([0, 1, 2, 3, 4, 5, 6, 8, 10, 14], [10, 12, 14, 14, 12, 10, 8, 8, 6, 4]);
    const skills = isDemo
      ? ['Node.js', 'Express', 'MongoDB', 'TypeScript', 'REST APIs', 'Docker', 'AWS', 'Redis']
      : sample(family.skills, int(5, 10));
    const city = isDemo ? 'Chennai' : pickHubCity();
    const titleBase = isDemo ? 'Backend Engineer' : pick(family.titles);
    const headline =
      exp === 0 ? `Aspiring ${titleBase} | ${skills.slice(0, 3).join(', ')}` : `${titleBase} | ${skills.slice(0, 3).join(', ')}`;
    const createdAt = daysAgo(isDemo ? 100 : rand() * 170);
    const userId = new Types.ObjectId();
    const email = isDemo ? DEMO.seeker.email : emailOf(name, i);

    const roles = Math.min(3, Math.ceil(exp / 3));
    const experience = Array.from({ length: roles }, (_, r) => {
      const current = r === 0;
      const yearsBack = (r + 1) * Math.max(1, Math.round(exp / Math.max(1, roles)));
      const start = daysAgo(yearsBack * 365);
      const end = current ? null : daysAgo((yearsBack - Math.max(1, Math.round(exp / Math.max(1, roles)))) * 365 + 30);
      return {
        title: `${r === 0 && exp >= 4 ? 'Senior ' : ''}${titleBase}`,
        company: pick(EMPLOYER_NAMES),
        startDate: start,
        endDate: current ? null : end,
        isCurrent: current,
        description: `Worked on ${pick(skills)} and ${pick(skills)} features end to end; improved reliability, code quality and delivery speed for the team.`
      };
    }).reverse();
    const [degree, field] = pick(DEGREES);
    const gradYear = new Date(NOW).getFullYear() - exp - int(0, 1);
    const education = [
      {
        degree,
        fieldOfStudy: field,
        institution: pick(INSTITUTIONS),
        startYear: gradYear - 4,
        endYear: gradYear,
        grade: `${(6.5 + rand() * 3.2).toFixed(1)} CGPA`
      }
    ];
    const phone = `+91 00000 ${pad(int(0, 99999))}`;

    const user: Doc = {
      _id: userId,
      name,
      email,
      password: isDemo ? demoHash : unusable,
      role: 'JOB_SEEKER',
      isActive: isDemo || !chance(0.02),
      createdAt,
      updatedAt: createdAt,
      ...(isDemo && { lastLoginAt: daysAgo(0) })
    };
    const profile: Doc = {
      _id: new Types.ObjectId(),
      user: userId,
      headline,
      phone,
      address: city,
      dateOfBirth: new Date(int(1985, 2003), int(0, 11), int(1, 28)),
      totalExperienceYears: exp,
      education,
      experience,
      skills,
      createdAt,
      updatedAt: createdAt
    };

    let resumeId: Types.ObjectId | null = null;
    if (isDemo || chance(0.88)) {
      resumeId = new Types.ObjectId();
      const lines = [
        headline,
        `${email}  |  ${phone}  |  ${city}`,
        '',
        'SKILLS',
        skills.join(', '),
        '',
        'EXPERIENCE',
        ...experience.flatMap((e) => [`${e.title}, ${e.company}  (${e.isCurrent ? 'current' : 'previous'})`, e.description]),
        ...(experience.length === 0 ? ['Personal and academic projects using ' + skills.slice(0, 3).join(', ') + '.'] : []),
        '',
        'EDUCATION',
        `${degree} ${field}, ${education[0]?.institution} (${gradYear})`
      ];
      const asDocx = !isDemo && chance(0.1);
      const fileId = new Types.ObjectId();
      const base = slug(name);
      let file: Buffer;
      let mimeType: string;
      let text: string | undefined;
      let originalName: string;
      if (asDocx) {
        const d = makeDocx(name, lines);
        file = d.file;
        text = d.text;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        originalName = `${base}-resume.docx`;
      } else {
        file = makePdf(name, lines);
        mimeType = 'application/pdf';
        originalName = `${base}-resume.pdf`;
      }
      out.resumeFiles.push({
        _id: fileId,
        length: file.length,
        chunkSize: 261_120,
        uploadDate: createdAt,
        filename: originalName,
        metadata: { ownerId: userId.toString(), contentType: mimeType }
      });
      out.resumeChunks.push({ _id: new Types.ObjectId(), files_id: fileId, n: 0, data: file });
      out.resumes.push({
        _id: resumeId,
        owner: userId,
        fileId,
        originalName,
        mimeType,
        size: file.length,
        sha256: crypto.createHash('sha256').update(file).digest('hex'),
        ...(text && { text }),
        createdAt,
        updatedAt: createdAt
      });
      (profile as Record<string, unknown>).resume = resumeId;
    }
    out.users.push(user);
    out.seekerProfiles.push(profile);
    seekers.push({ user, profile, resumeId, isDemo });
  }
  const demoSeeker = seekers[0] as Seeker;
  const eligible = seekers.filter((s) => s.resumeId && !s.isDemo && s.user.isActive);

  // ---- applications ---------------------------------------------------------------------------------------------------
  const coByCompany = new Map(cos.map((c) => [String(c.company._id), c]));
  const pairs = new Set<string>();
  const earliest = new Map<string, number>();
  const jobsSorted = [...out.jobs];
  const ranks = new Map(sample(jobsSorted, jobsSorted.length).map((j, i) => [String(j._id), i]));
  const jobWeights = out.jobs.map((j) => {
    const co = coByCompany.get(String(j.company)) as Co;
    return (1 / ((ranks.get(String(j._id)) as number) + 4) ** 0.75) * (j.status === 'CLOSED' ? 0.7 : 1) * (co.isDemo ? 3.5 : 1);
  });

  const cum: number[] = [];
  jobWeights.reduce((acc, w, i) => (cum[i] = acc + w), 0);
  const total = cum[cum.length - 1] as number;
  const pickJob = (): Doc => {
    const r = rand() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cum[mid] as number) < r) lo = mid + 1;
      else hi = mid;
    }
    return at(out.jobs, lo);
  };

  const STATUS_WEIGHTS = [38, 22, 15, 7, 18]; // APPLIED SHORTLISTED INTERVIEW SELECTED REJECTED
  const rejectDepth = (): ApplicationStatus[] =>
    weighted([['APPLIED'], ['APPLIED', 'SHORTLISTED'], ['APPLIED', 'SHORTLISTED', 'INTERVIEW']] as ApplicationStatus[][], [50, 30, 20]);
  const pathFor = (status: ApplicationStatus): ApplicationStatus[] => {
    switch (status) {
      case 'APPLIED':
        return ['APPLIED'];
      case 'SHORTLISTED':
        return ['APPLIED', 'SHORTLISTED'];
      case 'INTERVIEW':
        return ['APPLIED', 'SHORTLISTED', 'INTERVIEW'];
      case 'SELECTED':
        return ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED'];
      default:
        return [...rejectDepth(), 'REJECTED'];
    }
  };

  const addApplication = (job: Doc, s: Seeker, status: ApplicationStatus, appliedAt: Date): Doc => {
    const co = coByCompany.get(String(job.company)) as Co;
    const path = pathFor(status);
    const times = [appliedAt.getTime()];
    for (let i = 1; i < path.length; i += 1) times.push(Math.min(NOW - 60_000, (times[i - 1] as number) + (0.4 + rand() * 5) * DAY));
    const app: Doc = {
      _id: new Types.ObjectId(),
      job: job._id,
      applicant: s.user._id,
      company: job.company,
      recruiter: job.postedBy,
      resume: s.resumeId,
      applicantName: s.user.name,
      applicantEmail: s.user.email,
      jobTitle: job.title,
      jobLocation: job.location,
      companyName: job.companyName,
      status,
      coverNote: chance(0.45)
        ? `Hello, I'm excited about the ${job.title} role at ${job.companyName}. My background in ${(s.profile.skills as string[]).slice(0, 2).join(' and ')} fits what you are looking for.`
        : undefined,
      statusHistory: path.map((st, i) => ({
        status: st,
        changedAt: new Date(times[i] as number),
        changedBy: i === 0 ? s.user._id : co.recruiter._id
      })),
      appliedAt,
      createdAt: appliedAt,
      updatedAt: new Date(times[times.length - 1] as number)
    };
    if (status !== 'APPLIED' && chance(0.12)) {
      app.notes = Array.from({ length: int(1, 3) }, (_, i) => ({
        _id: new Types.ObjectId(),
        text: pick(NOTE_TEXTS),
        author: co.recruiter._id,
        createdAt: new Date(Math.min(NOW, appliedAt.getTime() + (i + 1) * 0.7 * DAY))
      }));
    }
    out.applications.push(app);
    const key = String(s.user._id);
    earliest.set(key, Math.min(earliest.get(key) ?? Infinity, appliedAt.getTime()));
    pairs.add(`${job._id}:${s.user._id}`);
    return app;
  };
  const appliedAtFor = (job: Doc): Date => {
    const start = (job.createdAt as Date).getTime();
    const span = Math.max(0, Math.min(NOW - DAY / 2, start + 35 * DAY) - start);
    return new Date(start + rand() ** 1.4 * span);
  };

  // The demo seeker: 25 applications covering every status, five of them at the demo recruiter's company.
  const demoJobs = out.jobs.filter(
    (j) => String(j.company) === String(demoCo.company._id) && j.status === 'OPEN' && (j.createdAt as Date).getTime() < NOW - 12 * DAY
  );
  const otherOldJobs = out.jobs.filter(
    (j) => String(j.company) !== String(demoCo.company._id) && (j.createdAt as Date).getTime() < NOW - 15 * DAY
  );
  const demoStatuses: ApplicationStatus[] = [
    ...(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'] as ApplicationStatus[]),
    ...Array<ApplicationStatus>(5).fill('APPLIED'),
    ...Array<ApplicationStatus>(5).fill('SHORTLISTED'),
    ...Array<ApplicationStatus>(4).fill('INTERVIEW'),
    'SELECTED',
    ...Array<ApplicationStatus>(5).fill('REJECTED')
  ];
  const chosen = [...sample(demoJobs, 5), ...sample(otherOldJobs, 20)];
  const demoApps = chosen.map((job, i) =>
    addApplication(job, demoSeeker, at(demoStatuses, i), new Date((job.createdAt as Date).getTime() + int(1, 8) * DAY))
  );

  // Everyone else.
  while (out.applications.length < SCALE.applications + demoApps.length) {
    const job = pickJob();
    const s = pick(eligible);
    if (pairs.has(`${job._id}:${s.user._id}`)) continue;
    addApplication(job, s, weighted(APPLICATION_STATUSES, STATUS_WEIGHTS), appliedAtFor(job));
  }

  // Accounts should predate their first application.
  for (const s of seekers) {
    const first = earliest.get(String(s.user._id));
    if (first !== undefined && (s.user.createdAt as Date).getTime() > first - DAY) {
      const t = new Date(first - int(1, 4) * DAY);
      s.user.createdAt = t;
      s.user.updatedAt = t;
      s.profile.createdAt = t;
      s.profile.updatedAt = t;
    }
  }

  // ---- saved jobs -----------------------------------------------------------------------------------------------------------
  const savedPairs = new Set<string>();
  const addSaved = (s: Seeker, job: Doc, createdAt: Date): void => {
    const key = `${s.user._id}:${job._id}`;
    if (savedPairs.has(key)) return;
    savedPairs.add(key);
    out.saved.push({ _id: new Types.ObjectId(), user: s.user._id, job: job._id, createdAt });
  };
  const openJobs = out.jobs.filter((j) => j.status === 'OPEN');
  for (const job of sample(
    openJobs.filter((j) => !pairs.has(`${j._id}:${demoSeeker.user._id}`)),
    15
  ))
    addSaved(demoSeeker, job, daysAgo(rand() * 20));
  for (const s of eligible) if (chance(0.3)) for (let k = 0; k < int(1, 6); k += 1) addSaved(s, pick(openJobs), daysAgo(rand() * 60));

  // ---- notifications (the TTL index removes those older than 90 days, so keep them recent) -------------------------------------
  const cutoff = NOW - 85 * DAY;
  const notify = (
    userId: Types.ObjectId,
    type: 'APPLICATION_SUBMITTED' | 'APPLICATION_STATUS',
    title: string,
    body: string,
    link: string,
    at_: number
  ): void => {
    if (at_ < cutoff) return;
    const createdAt = new Date(at_);
    const old = NOW - at_ > 6 * DAY;
    out.notifications.push({
      _id: new Types.ObjectId(),
      user: userId,
      type,
      title,
      body,
      link,
      ...(old || chance(0.25) ? { readAt: new Date(at_ + rand() * DAY) } : {}),
      createdAt
    });
  };
  const statusNote = (a: Doc): void => {
    const last = (a.statusHistory as Array<{ status: string; changedAt: Date }>).at(-1);
    if (!last || last.status === 'APPLIED') return;
    notify(
      a.applicant as Types.ObjectId,
      'APPLICATION_STATUS',
      'Application update',
      `Your application for ${a.jobTitle} at ${a.companyName} moved to ${last.status}`,
      `/seeker/applications/${a._id}`,
      last.changedAt.getTime()
    );
  };
  for (const a of demoApps) statusNote(a);
  const demoRecruiterId = demoCo.recruiter._id;
  const demoCompanyApps = out.applications
    .filter((a) => String(a.recruiter) === String(demoRecruiterId))
    .sort((x, y) => (y.appliedAt as Date).getTime() - (x.appliedAt as Date).getTime());
  for (const a of demoCompanyApps.slice(0, 60))
    notify(
      demoRecruiterId,
      'APPLICATION_SUBMITTED',
      'New application',
      `${a.applicantName} applied to ${a.jobTitle}`,
      `/recruiter/jobs/${a.job}/applicants`,
      (a.appliedAt as Date).getTime()
    );
  for (const a of sample(out.applications, Math.round(SCALE.applications * 0.15))) {
    if (String(a.recruiter) === String(demoRecruiterId) || String(a.applicant) === String(demoSeeker.user._id)) continue;
    if (chance(0.5)) statusNote(a);
    else
      notify(
        a.recruiter as Types.ObjectId,
        'APPLICATION_SUBMITTED',
        'New application',
        `${a.applicantName} applied to ${a.jobTitle}`,
        `/recruiter/jobs/${a.job}/applicants`,
        (a.appliedAt as Date).getTime()
      );
  }
  return out;
}

// ---- persistence ------------------------------------------------------------------------------------------------------------------

async function insert(name: string, docs: Doc[]): Promise<void> {
  const col = mongoose.connection.collection(name);
  for (let i = 0; i < docs.length; i += 2_000) await col.insertMany(docs.slice(i, i + 2_000) as never[], { ordered: false });
  log(`${name.padEnd(20)} ${docs.length.toLocaleString()}`);
}

const masked = (uri: string | undefined): string => (uri ?? '').replace(/\/\/[^@/]*@/, '//***@');

async function main(): Promise<void> {
  console.log(`\nSeeding demo data (${scaleName}) into ${masked(env.mongoUri)}`);
  await connectDB();
  const db = mongoose.connection.db!;
  console.log(`Database: ${mongoose.connection.name}`);

  const existing = await db.listCollections().toArray();
  let docs = 0;
  for (const c of existing) docs += await db.collection(c.name).estimatedDocumentCount();
  if (docs > 0 && !reset) {
    throw new Error(
      `"${mongoose.connection.name}" already contains ${docs.toLocaleString()} documents. Re-run with --reset to DROP everything in it and reseed.`
    );
  }
  if (reset) {
    for (const c of existing) await db.dropCollection(c.name);
    if (existing.length) log(`dropped ${existing.length} existing collections`);
  }
  await ensureIndexes();

  console.log('Generating…');
  const t0 = Date.now();
  const data = await build();
  log(`generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log('Inserting…');
  await insert(User.collection.name, data.users);
  await insert(Company.collection.name, data.companies);
  await insert(RecruiterProfile.collection.name, data.recruiterProfiles);
  await insert(JobSeekerProfile.collection.name, data.seekerProfiles);
  await insert('resumes.files', data.resumeFiles);
  await insert('resumes.chunks', data.resumeChunks);
  await db.collection('resumes.chunks').createIndex({ files_id: 1, n: 1 }, { unique: true });
  await db.collection('resumes.files').createIndex({ filename: 1, uploadDate: 1 });
  await insert(Resume.collection.name, data.resumes);
  await insert(Job.collection.name, data.jobs);
  await insert(Application.collection.name, data.applications);
  await insert(SavedJob.collection.name, data.saved);
  await insert(Notification.collection.name, data.notifications);
  await db
    .collection('_migrations')
    .insertMany(
      [jobSnapshots.name, applicationSnapshots.name, resumeDocuments.name].map((name) => ({ _id: name, appliedAt: new Date() })) as never[]
    );

  // Raw inserts bypass Mongoose validation, so validate a sample of every collection against the real schemas.
  console.log('Validating a sample against the schemas…');
  const checks: Array<[string, unknown]> = [
    ['users', User],
    ['companies', Company],
    ['jobs', Job],
    ['applications', Application],
    ['resumes', Resume],
    ['jobseekerprofiles', JobSeekerProfile],
    ['recruiterprofiles', RecruiterProfile],
    ['notifications', Notification],
    ['savedjobs', SavedJob]
  ];
  for (const [label, entry] of checks) {
    const model = entry as mongoose.Model<Record<string, unknown>>;
    const sampleDocs = await model.aggregate([{ $sample: { size: 300 } }]);
    let bad = 0;
    for (const d of sampleDocs) {
      try {
        await new model(d).validate();
      } catch (err) {
        bad += 1;
        if (bad === 1) console.error(`  ✗ ${label}: ${(err as Error).message}`);
      }
    }
    if (bad) throw new Error(`${label}: ${bad} of ${sampleDocs.length} sampled documents failed validation`);
  }
  log('all sampled documents are valid');
  void MatchAnalysis;
  void RefreshToken;

  const byStatus = await Application.aggregate<{ _id: string; n: number }>([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  const byType = await Job.aggregate<{ _id: string; n: number }>([
    { $group: { _id: '$employmentType', n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  const stats = await db.stats();
  console.log('\nDone.');
  log(`applications by status: ${byStatus.map((s) => `${s._id} ${s.n}`).join(', ')}`);
  log(`jobs by type:           ${byType.map((s) => `${s._id} ${s.n}`).join(', ')}`);
  log(`storage: data ${(stats.dataSize / 1e6).toFixed(0)} MB + indexes ${(stats.indexSize / 1e6).toFixed(0)} MB (Atlas M0 allows 512 MB)`);
  console.log('\nDemo accounts (password for all three):', DEMO.password);
  console.log(`  job seeker  ${DEMO.seeker.email}`);
  console.log(`  recruiter   ${DEMO.recruiter.email}   (company: ${DEMO.company}, ${DEMO.companyJobs} jobs)`);
  console.log(`  admin       ${DEMO.admin.email}`);
  console.log('All other seeded accounts have random passwords and cannot log in.\n');
  await disconnectDB();
}

main().catch(async (err: Error) => {
  console.error('\nSeed failed:', err.message);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
