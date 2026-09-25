import { idParam, jobIdParam } from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { ok } from '../../http/respond';
import * as matching from './matching.service';

/** POST /jobs/:jobId/match (JOB_SEEKER): my fit for this job. */
export const matchMeToJob = authedController({ params: jobIdParam }, async ({ user, params }) =>
  ok(await matching.matchSeekerToJob(user, params.jobId))
);

/** POST /applications/:id/match (RECRUITER of the hiring company, or ADMIN): this applicant's fit. */
export const matchApplication = authedController({ params: idParam }, async ({ user, params }) =>
  ok(await matching.matchApplication(user, params.id))
);
