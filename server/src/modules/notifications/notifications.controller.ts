import { markReadBody, notificationsQuery } from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { ok } from '../../http/respond';
import * as notifications from './notifications.service';

export const list = authedController({ query: notificationsQuery }, async ({ user, query }) => {
  const { items, unread } = await notifications.list(user, query.limit, query.unreadOnly);
  return ok(items, { meta: { unread, limit: query.limit } });
});

export const unreadCount = authedController({}, async ({ user }) => ok(await notifications.unreadCount(user)));

export const markRead = authedController({ body: markReadBody }, async ({ user, body }) => ok(await notifications.markRead(user, body)));
