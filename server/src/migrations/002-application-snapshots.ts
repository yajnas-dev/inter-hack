// Backfills the join-free snapshot fields on applications (recruiter, applicant, job, company). Idempotent.
import type { Types } from 'mongoose';
import { Application, Job, User } from '../models';

const BATCH = 2000;

export const applicationSnapshots = {
  name: '002-application-snapshots',
  async up(): Promise<void> {
    const cursor = Application.collection.find({ jobTitle: { $exists: false } }, { projection: { job: 1, applicant: 1 } });
    let batch: Array<{ _id: Types.ObjectId; job: Types.ObjectId; applicant: Types.ObjectId }> = [];

    const flush = async () => {
      if (!batch.length) return;
      const [jobs, users] = await Promise.all([
        Job.find({ _id: { $in: batch.map((a) => a.job) } })
          .select('title location company companyName postedBy')
          .lean(),
        User.find({ _id: { $in: batch.map((a) => a.applicant) } })
          .select('name email')
          .lean()
      ]);
      const jobById = new Map(jobs.map((j) => [String(j._id), j]));
      const userById = new Map(users.map((u) => [String(u._id), u]));

      const ops = [];
      for (const app of batch) {
        const job = jobById.get(String(app.job));
        const user = userById.get(String(app.applicant));
        if (!job || !user) continue;
        ops.push({
          updateOne: {
            filter: { _id: app._id },
            update: {
              $set: {
                company: job.company,
                recruiter: job.postedBy,
                jobTitle: job.title,
                jobLocation: job.location,
                companyName: job.companyName,
                applicantName: user.name,
                applicantEmail: user.email
              }
            }
          }
        });
      }
      if (ops.length) await Application.collection.bulkWrite(ops, { ordered: false });
      batch = [];
    };

    for await (const app of cursor) {
      batch.push(app as (typeof batch)[number]);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
  }
};
