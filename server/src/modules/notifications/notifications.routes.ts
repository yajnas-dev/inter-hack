import { Router } from 'express';
import { authenticate } from '../../http/middleware/auth';
import * as notifications from './notifications.controller';

/** /api/v1/notifications: always the caller's own. */
export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', notifications.list);
notificationsRouter.get('/unread-count', notifications.unreadCount);
// Bulk state change on the collection: { ids: [...] } or { all: true } -> { unread }.
notificationsRouter.patch('/', notifications.markRead);
