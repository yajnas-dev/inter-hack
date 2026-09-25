import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as companies from './companies.controller';

/** /api/v1/companies. Company profiles are public; only their own recruiter edits them (admins delete via /admin). */
export const companiesRouter = Router();

companiesRouter.post('/', authenticate, requireRole('RECRUITER'), companies.create);
companiesRouter.get('/:id', companies.getOne);
companiesRouter.patch('/:id', authenticate, requireRole('RECRUITER'), companies.update);
