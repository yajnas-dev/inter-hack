import type { ApplicationDTO, ApplicationStatus } from '@jobportal/shared';

/** What a seeker should expect at each stage, in plain words. */
export const NEXT_STEP: Record<ApplicationStatus, string> = {
  APPLIED: 'Waiting for the recruiter to review your application.',
  SHORTLISTED: 'You are on the shortlist. An interview may come next.',
  INTERVIEW: 'Interview stage. Keep an eye on your notifications.',
  SELECTED: 'You were selected. Congratulations!',
  REJECTED: 'This application is not moving forward.'
};

const DAY = 86_400_000;

export const daysSince = (iso: string | undefined, now = Date.now()): number =>
  iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : 0;

/** When the application last changed stage (falls back to the day it was submitted). */
export const lastChange = (app: ApplicationDTO): string => app.stageSince ?? app.appliedAt;

/** A quiet nudge when nothing has happened for two weeks; never shown for finished applications. */
export function staleNote(app: ApplicationDTO): string | null {
  if (app.status === 'SELECTED' || app.status === 'REJECTED') return null;
  const days = daysSince(lastChange(app));
  return days >= 14 ? `No change in ${days} days. Reviews can take a while; you can keep applying in the meantime.` : null;
}
