// Backfills the fields added for the read-path optimisations. Idempotent.
import type { AnyBulkWriteOperation } from 'mongodb';
import { Application, Company, Job } from '../models';
import { tokenize } from '../utils/tokenize';

export const jobSnapshots = {
  name: '001-job-snapshots',
  async up(): Promise<void> {
    // Company snapshot on jobs.
    for (const company of await Company.find().select('name logoUrl').lean()) {
      const $set: Record<string, string> = { companyName: company.name };
      if (company.logoUrl) $set.companyLogoUrl = company.logoUrl;
      await Job.updateMany({ company: company._id }, { $set });
    }

    // Search mirrors (title tokens, lowercase location/skills), in batches.
    const cursor = Job.collection.find({ titleTokens: { $exists: false } }, { projection: { title: 1, location: 1, requiredSkills: 1 } });
    let ops: AnyBulkWriteOperation[] = [];
    const flush = async () => {
      if (ops.length) await Job.collection.bulkWrite(ops, { ordered: false });
      ops = [];
    };
    for await (const job of cursor) {
      ops.push({
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              titleTokens: tokenize(job.title),
              locationLower: String(job.location ?? '').toLowerCase(),
              requiredSkillsLower: ((job.requiredSkills ?? []) as string[]).map((s) => s.toLowerCase())
            }
          }
        }
      });
      if (ops.length >= 1000) await flush();
    }
    await flush();

    // Company on applications (used by per-company reports).
    for (const companyId of await Job.distinct('company')) {
      const jobIds = await Job.find({ company: companyId }).distinct('_id');
      await Application.updateMany({ job: { $in: jobIds }, company: { $exists: false } }, { $set: { company: companyId } });
    }
  }
};
