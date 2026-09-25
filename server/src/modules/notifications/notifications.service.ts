import type { MarkReadBody, NotificationDTO, NotificationsDTO } from '@jobportal/shared';
import { events } from '../../infra/events';
import { logger } from '../../infra/logger';
import { Application, Notification, type NotificationAttrs, type NotificationType } from '../../models';

const toDTO = (n: NotificationAttrs): NotificationDTO => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: Boolean(n.readAt),
  createdAt: n.createdAt.toISOString()
});

export async function list(userId: string, limit: number): Promise<NotificationsDTO> {
  const [items, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } })
  ]);
  return { items: items.map(toDTO), unread };
}

export async function unreadCount(userId: string): Promise<{ unread: number }> {
  return { unread: await Notification.countDocuments({ user: userId, readAt: { $exists: false } }) };
}

export async function markRead(userId: string, body: MarkReadBody): Promise<{ unread: number }> {
  const filter: Record<string, unknown> = { user: userId, readAt: { $exists: false } };
  if (!body.all) filter._id = { $in: body.ids ?? [] };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return unreadCount(userId);
}

async function create(user: unknown, type: NotificationType, title: string, body: string, link: string): Promise<void> {
  await Notification.create({ user, type, title, body, link });
}

// Notifications are produced by domain events, so the application services stay unaware of them.
// A failure here must never affect the request that triggered the event.
events.on('application.submitted', async ({ applicationId, jobId }) => {
  try {
    const app = await Application.findById(applicationId).select('recruiter applicantName jobTitle').lean();
    if (!app?.recruiter) return;
    await create(
      app.recruiter,
      'APPLICATION_SUBMITTED',
      'New application',
      `${app.applicantName ?? 'A candidate'} applied to ${app.jobTitle ?? 'your job'}`,
      `/recruiter/jobs/${jobId}/applicants`
    );
  } catch (err) {
    logger.warn({ err }, 'could not create application notification');
  }
});

events.on('application.statusChanged', async ({ applicationId, to }) => {
  try {
    const app = await Application.findById(applicationId).select('applicant jobTitle companyName').lean();
    if (!app) return;
    const where = app.companyName ? ` at ${app.companyName}` : '';
    await create(
      app.applicant,
      'APPLICATION_STATUS',
      'Application update',
      `Your application for ${app.jobTitle ?? 'a job'}${where} moved to ${to}`,
      `/seeker/applications/${applicationId}`
    );
  } catch (err) {
    logger.warn({ err }, 'could not create status notification');
  }
});
