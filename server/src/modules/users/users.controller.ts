import {
  changePasswordBody,
  jobIdParam,
  myJobsQuery,
  paginationQuery,
  recruiterProfileBody,
  seekerProfileBody,
  updateMeBody
} from '@jobportal/shared';
import { authedController, validateInput } from '../../http/controller';
import { AuthorizationError } from '../../http/errors';
import { noContent, ok } from '../../http/respond';
import * as users from './users.service';

export const getMe = authedController({}, async ({ user }) => ok(await users.getMe(user)));

export const updateMe = authedController({ body: updateMeBody }, async ({ user, body }) => ok(await users.updateMe(user, body)));

export const changePassword = authedController({ body: changePasswordBody }, async ({ user, body }) => {
  await users.changePassword(user, body);
  return noContent();
});

export const getProfile = authedController({}, async ({ user }) => ok(await users.getProfile(user)));

/** The accepted body depends on the caller's role (seeker profile vs recruiter profile). */
export const updateProfile = authedController({}, async ({ user, req }) => {
  if (user.role === 'JOB_SEEKER') return ok(await users.updateSeekerProfile(user, validateInput({ body: seekerProfileBody }, req).body));
  if (user.role === 'RECRUITER')
    return ok(await users.updateRecruiterProfile(user, validateInput({ body: recruiterProfileBody }, req).body));
  throw new AuthorizationError('Administrators have no editable profile');
});

export const myJobs = authedController({ query: myJobsQuery }, async ({ user, query }) => {
  const page = await users.myJobs(user, query);
  return ok(page.items, { meta: page.meta });
});

export const dashboard = authedController({}, async ({ user }) => ok(await users.dashboard(user)));

export const savedJobs = authedController({ query: paginationQuery }, async ({ user, query }) => {
  const page = await users.savedJobs(user, query);
  return ok(page.items, { meta: page.meta });
});

export const savedJobIds = authedController({}, async ({ user }) => ok(await users.savedJobIds(user)));

export const saveJob = authedController({ params: jobIdParam }, async ({ user, params }) => {
  await users.saveJob(user, params.jobId);
  return noContent();
});

export const unsaveJob = authedController({ params: jobIdParam }, async ({ user, params }) => {
  await users.unsaveJob(user, params.jobId);
  return noContent();
});
