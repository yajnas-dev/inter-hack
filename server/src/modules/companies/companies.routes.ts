import { Router } from 'express';
import { companyBody, companyUpdateBody, idParam } from '@jobportal/shared';
import { handle, handleAuthed } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as companies from './companies.service';

export const companiesRouter = Router();

companiesRouter.post(
  '/',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ body: companyBody }, async ({ user, body, res }) => {
    const company = await companies.createCompany(user.id, body);
    res.status(201);
    return { company };
  })
);

companiesRouter.get(
  '/:id',
  handle({ params: idParam }, async ({ params }) => ({ company: await companies.getCompany(params.id) }))
);

companiesRouter.put(
  '/:id',
  authenticate,
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam, body: companyUpdateBody }, async ({ user, params, body }) => ({
    company: await companies.updateCompany(params.id, user.id, body)
  }))
);
