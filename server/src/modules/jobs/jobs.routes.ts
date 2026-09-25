import { Router } from 'express';
import { idParam, jobCreateBody, jobIdParam, jobListQuery, jobUpdateBody, pagedListQuery } from '@jobportal/shared';
import { handle, handleAuthed, parseInput } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { cacheKey, publicJobCache } from '../../infra/cache/json';
import * as applications from '../applications/applications.service';
import * as discovery from './jobs.discovery';
import * as jobs from './jobs.service';

export const jobsRouter = Router();

// ---- public (anonymous, cached) -------------------------------------------------------------

jobsRouter.get(
  '/',
  // Cache first: a hit does no parsing or querying. Invalid input throws inside the compute step, so it is never cached.
  handle({}, ({ req, res }) =>
    publicJobCache.respond(req, res, cacheKey(req), () => jobs.searchPublic(parseInput(jobListQuery, req.query)))
  )
);

// Filter options with counts (declared before '/:id' so "facets" is not read as an id).
jobsRouter.get(
  '/facets',
  handle({}, ({ req, res }) => publicJobCache.respond(req, res, cacheKey(req), () => discovery.facets()))
);

// ---- recruiter (declared before '/:id' so "mine" is not read as an id) ----------------------

jobsRouter.get(
  '/mine',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ query: pagedListQuery }, ({ user, query }) => jobs.listMine(user.id, query.page, query.limit))
);

jobsRouter.get(
  '/:id',
  handle({}, ({ req, res }) => publicJobCache.respond(req, res, cacheKey(req), () => jobs.getPublic(parseInput(idParam, req.params).id)))
);

jobsRouter.get(
  '/:id/similar',
  handle({}, ({ req, res }) =>
    publicJobCache.respond(req, res, cacheKey(req), () => discovery.similarTo(parseInput(idParam, req.params).id))
  )
);

jobsRouter.post(
  '/',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ body: jobCreateBody }, async ({ user, body, res }) => {
    const job = await jobs.createJob(user.id, body);
    res.status(201);
    return { job };
  })
);

jobsRouter.put(
  '/:id',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam, body: jobUpdateBody }, async ({ user, params, body }) => ({
    job: await jobs.updateJob(params.id, user.id, body)
  }))
);

jobsRouter.delete(
  '/:id',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam }, async ({ user, params }) => {
    await jobs.deleteJob(params.id, user.id);
    return { message: 'Job deleted' };
  })
);

jobsRouter.patch(
  '/:id/close',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam }, async ({ user, params }) => ({ job: await jobs.closeJob(params.id, user.id) }))
);

// FR-06: applicants of a job, visible only to the recruiter who posted it.
jobsRouter.get(
  '/:jobId/applications',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ params: jobIdParam }, async ({ user, params }) => ({
    applications: await applications.listForJob(params.jobId, user.id)
  }))
);
