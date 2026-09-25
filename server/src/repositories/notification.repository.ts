import type { ClientSession } from 'mongoose';
import { Notification, type NotificationAttrs } from '../models';

export const create = (row: Pick<NotificationAttrs, 'type' | 'title' | 'body' | 'link'> & { user: unknown }) => Notification.create(row);

export const listForUser = (userId: string, limit: number, unreadOnly: boolean) =>
  Notification.find({ user: userId, ...(unreadOnly && { readAt: { $exists: false } }) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

export const countUnread = (userId: string) => Notification.countDocuments({ user: userId, readAt: { $exists: false } });

/** Only the caller's own notifications can be matched: `user` is always part of the filter. */
export const markRead = (userId: string, ids: string[] | 'all') =>
  Notification.updateMany(
    { user: userId, readAt: { $exists: false }, ...(ids !== 'all' && { _id: { $in: ids } }) },
    { $set: { readAt: new Date() } }
  );

export const deleteForUser = (userId: unknown, session?: ClientSession) => Notification.deleteMany({ user: userId }, { session });
