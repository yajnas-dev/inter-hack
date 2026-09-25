// Seeds a realistic dataset into the benchmark database. Usage: node bench/seed.js [jobs] [applications]
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'bench';
const { connectDB, ensureIndexes } = require('../server/src/infra/db');
const { User, Company, Job, Application, RecruiterProfile, JobSeekerProfile, Resume } = require('../server/src/models');

const BENCH_URI = process.env.BENCH_MONGO_URI || 'mongodb://127.0.0.1:27017/job_portal_bench?replicaSet=rs0';
const N = { companies: 300, seekers: 5000, jobs: Number(process.argv[2]) || 20000, apps: Number(process.argv[3]) || 60000 };
const cities = ['Bangalore', 'Pune', 'Delhi', 'Mumbai', 'Hyderabad', 'Chennai', 'Kolkata', 'Remote', 'Noida', 'Gurgaon'];
const titles = [
  'Backend Engineer',
  'Frontend Engineer',
  'Full Stack Developer',
  'Data Analyst',
  'DevOps Engineer',
  'QA Engineer',
  'Product Manager',
  'UI Designer',
  'ML Engineer',
  'Support Engineer'
];
const skillPool = ['JavaScript', 'React', 'Node.js', 'Python', 'SQL', 'Docker', 'AWS', 'Java', 'Go', 'TypeScript', 'MongoDB', 'Kubernetes'];
const types = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chunk = async (arr, size, fn) => {
  for (let i = 0; i < arr.length; i += size) await fn(arr.slice(i, i + size));
};

(async () => {
  await connectDB(BENCH_URI);
  await mongoose.connection.dropDatabase();
  await ensureIndexes();
  const t0 = Date.now();
  const hash = await bcrypt.hash('password123', 10);

  await User.create({ name: 'Admin', email: 'admin@bench.io', password: hash, role: 'ADMIN' });
  const recruiters = await User.insertMany(
    Array.from({ length: N.companies }, (_, i) => ({
      name: `Recruiter ${i}`,
      email: `rec${i}@bench.io`,
      password: hash,
      role: 'RECRUITER'
    }))
  );
  const companies = await Company.insertMany(
    recruiters.map((r, i) => ({
      name: `Company ${i}`,
      industry: 'Tech',
      location: pick(cities),
      description: 'x'.repeat(200),
      createdBy: r._id
    }))
  );
  await RecruiterProfile.insertMany(recruiters.map((r, i) => ({ user: r._id, company: companies[i]._id })));

  const seekers = [];
  const seekerDocs = Array.from({ length: N.seekers }, (_, i) => ({
    name: `Seeker ${i}`,
    email: `seek${i}@bench.io`,
    password: hash,
    role: 'JOB_SEEKER'
  }));
  await chunk(seekerDocs, 1000, async (c) => seekers.push(...(await User.insertMany(c))));
  // One shared resume document (the bytes are never read by the benchmark).
  const resume = await Resume.create({
    owner: seekers[0]._id,
    fileId: new mongoose.Types.ObjectId(),
    originalName: 'r.pdf',
    mimeType: 'application/pdf',
    size: 1000,
    sha256: '0'.repeat(64)
  });
  await JobSeekerProfile.insertMany(seekers.map((s) => ({ user: s._id, skills: [pick(skillPool)], resume: resume._id })));

  const jobs = [];
  const jobDocs = Array.from({ length: N.jobs }, () => {
    const ci = Math.floor(Math.random() * N.companies);
    return {
      title: `${pick(['Senior', 'Junior', 'Lead', ''])} ${pick(titles)}`.trim(),
      company: companies[ci]._id,
      companyName: companies[ci].name,
      postedBy: recruiters[ci]._id,
      description: `We are hiring. ${'Responsibilities include building and maintaining services, collaborating with teams, and shipping quality. '.repeat(8)}`,
      location: pick(cities),
      salaryMin: 300000 + Math.floor(Math.random() * 5) * 100000,
      salaryMax: 900000 + Math.floor(Math.random() * 10) * 100000,
      requiredSkills: [...new Set([pick(skillPool), pick(skillPool), pick(skillPool)])],
      experienceRequired: Math.floor(Math.random() * 10),
      employmentType: pick(types),
      status: Math.random() < 0.9 ? 'OPEN' : 'CLOSED'
    };
  });
  await chunk(jobDocs, 2000, async (c) => jobs.push(...(await Job.insertMany(c))));

  const statuses = ['APPLIED', 'APPLIED', 'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'];
  const seen = new Set();
  const appDocs = [];
  while (appDocs.length < N.apps) {
    const j = jobs[Math.floor(Math.random() * jobs.length)];
    const s = seekers[Math.floor(Math.random() * seekers.length)];
    const key = `${j._id}:${s._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    appDocs.push({
      job: j._id,
      company: j.company,
      recruiter: j.postedBy,
      applicantName: s.name,
      applicantEmail: s.email,
      jobTitle: j.title,
      jobLocation: j.location,
      companyName: j.companyName,
      applicant: s._id,
      status: pick(statuses),
      appliedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 864e5),
      resume: resume._id,
      statusHistory: [{ status: 'APPLIED', changedBy: s._id }]
    });
  }
  await chunk(appDocs, 5000, (c) => Application.insertMany(c, { ordered: false }));

  // A recruiter that owns a job with applicants, and a seeker with applications, for authenticated scenarios.
  const busy = (await Application.aggregate([{ $group: { _id: '$job', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]))[0];
  const job = await Job.findById(busy._id).lean();
  const anyApp = await Application.findOne().lean();
  const fixture = {
    jobId: String(job._id),
    recruiter: (await User.findById(job.postedBy).lean()).email,
    seeker: (await User.findById(anyApp.applicant).lean()).email
  };
  fs.writeFileSync(path.join(__dirname, '.bench-fixture.json'), JSON.stringify(fixture));
  console.log(
    JSON.stringify({
      seedSeconds: (Date.now() - t0) / 1000,
      ...fixture,
      counts: { users: await User.countDocuments(), jobs: await Job.countDocuments(), applications: await Application.countDocuments() }
    })
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
