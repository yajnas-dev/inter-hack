import { Router } from 'express';
import { recruiterProfileBody, seekerProfileBody } from '@jobportal/shared';
import { handleAuthed } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { resumeUpload } from '../../http/middleware/upload';
import { getRecruiterOverview } from './overview.service';
import * as profiles from './profiles.service';

export const seekerRouter = Router();
seekerRouter.use(authenticate, requireRole('JOB_SEEKER'));

seekerRouter.get(
  '/me',
  handleAuthed({}, async ({ user }) => ({ profile: await profiles.getSeekerProfile(user.id) }))
);
seekerRouter.put(
  '/me',
  handleAuthed({ body: seekerProfileBody }, async ({ user, body }) => ({ profile: await profiles.updateSeekerProfile(user.id, body) }))
);
seekerRouter.post(
  '/me/resume',
  resumeUpload.single('resume'),
  handleAuthed({}, async ({ user, req, res }) => {
    const resume = await profiles.uploadResume(user.id, req.file);
    res.status(201);
    return { resume };
  })
);
seekerRouter.get(
  '/me/resume',
  handleAuthed({}, ({ user, res }) => profiles.downloadOwnResume(user.id, res))
);
seekerRouter.delete(
  '/me/resume',
  handleAuthed({}, async ({ user }) => {
    await profiles.deleteResume(user.id);
    return { message: 'Resume deleted' };
  })
);

export const recruiterRouter = Router();
recruiterRouter.use(authenticate, requireRole('RECRUITER'));

recruiterRouter.get(
  '/me/overview',
  handleAuthed({}, ({ user }) => getRecruiterOverview(user.id))
);

recruiterRouter.get(
  '/me',
  handleAuthed({}, async ({ user }) => ({ profile: await profiles.getRecruiterProfile(user.id) }))
);
recruiterRouter.put(
  '/me',
  handleAuthed({ body: recruiterProfileBody }, async ({ user, body }) => ({
    profile: await profiles.updateRecruiterProfile(user.id, body)
  }))
);
