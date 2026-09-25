import type { MarkReadBody, NotificationDTO } from '@jobportal/shared';
import { events } from '../../infra/events';
import { logger } from '../../infra/logger';
import * as applications from '../../repositories/application.repository';
import * as notifications from '../../repositories/notification.repository';
import { presentNotification } from '../../utils/presenters';

type User = Express.AuthUser;

export async function list(user: User, limit: number, unreadOnly = false): Promise<{ items: NotificationDTO[]; unread: number }> {
  const [rows, unread] = await Promise.all([notifications.listForUser(user.id, limit, unreadOnly), notifications.countUnread(user.id)]);
  return { items: rows.map(presentNotification), unread };
}

export const unreadCount = async (user: User): Promise<{ unread: number }> => ({ unread: await notifications.countUnread(user.id) });

export async function markRead(user: User, body: MarkReadBody): Promise<{ unread: number }> {
  await notifications.markRead(user.id, body.all ? 'all' : (body.ids ?? []));
  return unreadCount(user);
}

// Notifications are produced from domain events, so the application services stay unaware of them.
// A failure here must never affect the request that triggered the event.
events.on('application.submitted', async ({ applicationId, jobId }) => {
  try {
    const app = await applications.findById(applicationId);
    if (!app?.recruiter) return;
    await notifications.create({
      user: app.recruiter,
      type: 'APPLICATION_SUBMITTED',
      title: 'New application',
      body: `${app.applicantName ?? 'A candidate'} applied to ${app.jobTitle ?? 'your job'}`,
      link: `/recruiter/jobs/${jobId}/applicants`
    });
  } catch (err) {
    logger.warn({ err }, 'could not create application notification');
  }
});

events.on('application.statusChanged', async ({ applicationId, to }) => {
  try {
    const app = await applications.findById(applicationId);
    if (!app) return;
    const where = app.companyName ? ` at ${app.companyName}` : '';
    await notifications.create({
      user: app.applicant,
      type: 'APPLICATION_STATUS',
      title: 'Application update',
      body: `Your application for ${app.jobTitle ?? 'a job'}${where} moved to ${to}`,
      link: `/seeker/applications/${applicationId}`
    });
  } catch (err) {
    logger.warn({ err }, 'could not create status notification');
  }
});
