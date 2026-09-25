import type { CompanyBody } from '@jobportal/shared';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { forbidden, notFound } from '../../http/errors';
import { Application, Company, Job, RecruiterProfile } from '../../models';
import { withId } from '../../utils/serialize';

const definedFields = (body: Partial<CompanyBody>) => Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

export async function createCompany(userId: string, body: CompanyBody) {
  const company = await withTransaction(async (session) => {
    const [created] = await Company.create([{ ...definedFields(body), createdBy: userId }], { session });
    await RecruiterProfile.updateOne({ user: userId }, { $set: { company: created!._id } }, { upsert: true, session });
    return created!;
  });
  return withId(company);
}

export async function getCompany(id: string) {
  const company = await Company.findById(id).lean();
  if (!company) throw notFound('Company not found');
  return withId(company);
}

export async function updateCompany(id: string, userId: string, body: Partial<CompanyBody>) {
  const existing = await Company.findById(id).select('createdBy').lean();
  if (!existing) throw notFound('Company not found');
  if (String(existing.createdBy) !== userId) throw forbidden('You do not own this company profile');

  const changes = definedFields(body);
  const snapshotChanged = 'name' in changes || 'logoUrl' in changes;

  const updated = await withTransaction(async (session) => {
    const company = await Company.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true, session }).lean();
    // Jobs and applications carry snapshots of the company's display fields; keep them in sync atomically.
    if (company && snapshotChanged) {
      await Job.updateMany({ company: id }, { $set: { companyName: company.name, companyLogoUrl: company.logoUrl } }, { session });
      if ('name' in changes) await Application.updateMany({ company: id }, { $set: { companyName: company.name } }, { session });
    }
    return company;
  });

  if (snapshotChanged) events.emit('jobs.changed', {});
  return withId(updated);
}
