import type { CompanyBody, CompanyDTO, CompanyUpdateBody } from '@jobportal/shared';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { ConflictError, NotFoundError } from '../../http/errors';
import { assertCanEditCompany, forgetRecruiterCompany, recruiterCompanyId } from '../../policies/access';
import * as applications from '../../repositories/application.repository';
import * as companies from '../../repositories/company.repository';
import * as jobs from '../../repositories/job.repository';
import * as profiles from '../../repositories/profile.repository';
import { presentCompany } from '../../utils/presenters';

type User = Express.AuthUser;

const defined = <T extends object>(body: T): Partial<T> =>
  Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as Partial<T>;

/** A recruiter registers exactly one company and is linked to it in the same transaction. */
export async function createCompany(user: User, body: CompanyBody): Promise<CompanyDTO> {
  if (await recruiterCompanyId(user.id)) throw new ConflictError('You already have a company profile', 'COMPANY_EXISTS');

  // The unique index on createdBy settles a race between two simultaneous creates (-> 409 COMPANY_EXISTS).
  const company = await withTransaction(async (session) => {
    const created = await companies.create({ ...defined(body), name: body.name, createdBy: user.id }, session);
    await profiles.setCompany(user.id, created._id, session);
    return created;
  });
  forgetRecruiterCompany(user.id);
  events.emit('company.changed', { companyId: String(company._id), recruiterId: user.id });
  return presentCompany(company);
}

export async function getCompany(id: string): Promise<CompanyDTO> {
  const company = await companies.findById(id);
  if (!company) throw new NotFoundError('Company');
  return presentCompany(company);
}

/** Jobs and applications carry snapshots of the company's display fields; they change in the same transaction. */
export async function updateCompany(user: User, id: string, body: CompanyUpdateBody): Promise<CompanyDTO> {
  if (!(await companies.findById(id))) throw new NotFoundError('Company');
  await assertCanEditCompany(user, id);

  const changes = defined(body);
  const snapshotChanged = 'name' in changes || 'logoUrl' in changes;

  const updated = await withTransaction(async (session) => {
    const company = await companies.update(id, changes, session);
    if (company && snapshotChanged) {
      await jobs.syncCompanySnapshot(id, { companyName: company.name, companyLogoUrl: company.logoUrl }, session);
      if ('name' in changes) await applications.syncCompanyName(id, company.name, session);
    }
    return company;
  });
  if (!updated) throw new NotFoundError('Company');

  if (snapshotChanged) events.emit('jobs.changed', {});
  return presentCompany(updated);
}
