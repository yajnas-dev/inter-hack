import {
  adminApplicationListQuery,
  adminCompanyListQuery,
  adminJobListQuery,
  adminJobUpdateBody,
  adminUserListQuery,
  adminUserUpdateBody,
  idParam
} from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { noContent, ok } from '../../http/respond';
import type { Paged } from '../../utils/pagination';
import * as admin from './admin.service';

const page = <T>(p: Paged<T>) => ok(p.items, { meta: p.meta });

export const listUsers = authedController({ query: adminUserListQuery }, async ({ query }) => page(await admin.listUsers(query)));
export const getUser = authedController({ params: idParam }, async ({ params }) => ok(await admin.getUser(params.id)));
export const updateUser = authedController({ params: idParam, body: adminUserUpdateBody }, async ({ user, params, body }) =>
  ok(await admin.setUserActive(user, params.id, body.isActive))
);
export const deleteUser = authedController({ params: idParam }, async ({ user, params }) => {
  await admin.deleteUser(user, params.id);
  return noContent();
});

export const listCompanies = authedController({ query: adminCompanyListQuery }, async ({ query }) =>
  page(await admin.listCompanies(query))
);
export const deleteCompany = authedController({ params: idParam }, async ({ user, params }) => {
  await admin.deleteCompany(user, params.id);
  return noContent();
});

export const listJobs = authedController({ query: adminJobListQuery }, async ({ query }) => page(await admin.listJobs(query)));
export const updateJob = authedController({ params: idParam, body: adminJobUpdateBody }, async ({ user, params, body }) =>
  ok(await admin.setJobStatus(user, params.id, body.status))
);
export const deleteJob = authedController({ params: idParam }, async ({ user, params }) => {
  await admin.deleteJob(user, params.id);
  return noContent();
});

export const listApplications = authedController({ query: adminApplicationListQuery }, async ({ query }) =>
  page(await admin.listApplications(query))
);
