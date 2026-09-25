import type { Request, Response } from 'express';
import { applicationListQuery, idParam, jobCreateBody, jobIdParam, jobListQuery, jobUpdateBody } from '@jobportal/shared';
import { cacheKey, publicJobCache } from '../../infra/cache/json';
import { authedController, controller, validateInput } from '../../http/controller';
import { alreadySent, created, envelope, noContent, ok } from '../../http/respond';
import * as jobs from './jobs.service';

/**
 * Anonymous reads are served from a short-lived, pre-serialised cache (ETag + 304, gzip). Input is validated
 * inside `compute`, so invalid requests throw before anything is cached.
 */
async function cachedPublic(req: Request, res: Response, compute: () => Promise<unknown>) {
  await publicJobCache.respond(req, res, cacheKey(req), compute);
  return alreadySent();
}

export const search = controller({}, ({ req, res }) =>
  cachedPublic(req, res, async () => {
    const { query } = validateInput({ query: jobListQuery }, req);
    const page = await jobs.search(query);
    return envelope(page.items, page.meta);
  })
);

export const facets = controller({}, ({ req, res }) => cachedPublic(req, res, async () => envelope(await jobs.facets())));

export const getOne = controller({}, ({ req, res }) =>
  cachedPublic(req, res, async () => envelope(await jobs.getJob(validateInput({ params: idParam }, req).params.id)))
);

export const similar = controller({}, ({ req, res }) =>
  cachedPublic(req, res, async () => envelope(await jobs.similar(validateInput({ params: idParam }, req).params.id)))
);

export const create = authedController({ body: jobCreateBody }, async ({ user, body }) => {
  const job = await jobs.createJob(user, body);
  return created(job, `/api/v1/jobs/${job.id}`, 'Job created');
});

export const update = authedController({ params: idParam, body: jobUpdateBody }, async ({ user, params, body }) =>
  ok(await jobs.updateJob(user, params.id, body))
);

export const remove = authedController({ params: idParam }, async ({ user, params }) => {
  await jobs.deleteJob(user, params.id);
  return noContent();
});

export const applicants = authedController({ params: jobIdParam, query: applicationListQuery }, async ({ user, params, query }) => {
  const page = await jobs.listApplicants(user, params.jobId, query);
  return ok(page.items, { meta: page.meta });
});
