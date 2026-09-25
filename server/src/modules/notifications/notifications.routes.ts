import { Router } from 'express';
import { markReadBody, notificationsQuery } from '@jobportal/shared';
import { handleAuthed } from '../../http/handle';
import { authenticate } from '../../http/middleware/auth';
import * as notifications from './notifications.service';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  handleAuthed({ query: notificationsQuery }, ({ user, query }) => notifications.list(user.id, query.limit))
);

notificationsRouter.get(
  '/unread-count',
  handleAuthed({}, ({ user }) => notifications.unreadCount(user.id))
);

notificationsRouter.post(
  '/read',
  handleAuthed({ body: markReadBody }, ({ user, body }) => notifications.markRead(user.id, body))
);
