import { reportRangeQuery } from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { ok } from '../../http/respond';
import * as reports from './reports.service';

export const summary = authedController({}, async () => ok(await reports.summary()));
export const applicationsOverTime = authedController({ query: reportRangeQuery }, async ({ query }) =>
  ok(await reports.applicationsOverTime(query.days), { meta: { days: query.days } })
);
export const topJobs = authedController({}, async () => ok(await reports.topJobs()));
export const topCompanies = authedController({}, async () => ok(await reports.topCompanies()));
