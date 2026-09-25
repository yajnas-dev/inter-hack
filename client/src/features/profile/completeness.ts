import type { SeekerProfileDTO } from '@jobportal/shared';

export interface CompletenessItem {
  key: string;
  label: string;
  doneLabel: string;
  done: boolean;
  /** Where to fix it. */
  anchor: string;
}

/** A plain checklist (not a score model): each item is 20% of the profile. */
export function profileCompleteness(p: SeekerProfileDTO | undefined): { percent: number; items: CompletenessItem[] } {
  const items: CompletenessItem[] = [
    {
      key: 'headline',
      label: 'Add a professional headline',
      doneLabel: 'Professional headline added',
      done: Boolean(p?.headline?.trim()),
      anchor: 'about'
    },
    {
      key: 'skills',
      label: 'List at least 3 skills',
      doneLabel: '3 or more skills listed',
      done: (p?.skills.length ?? 0) >= 3,
      anchor: 'skills'
    },
    {
      key: 'experience',
      label: 'Add your experience',
      doneLabel: 'Experience added',
      done: (p?.experience.length ?? 0) > 0,
      anchor: 'experience'
    },
    {
      key: 'education',
      label: 'Add your education',
      doneLabel: 'Education added',
      done: (p?.education.length ?? 0) > 0,
      anchor: 'education'
    },
    { key: 'resume', label: 'Upload your resume', doneLabel: 'Resume uploaded', done: Boolean(p?.resume), anchor: 'resume' }
  ];
  return { percent: Math.round((items.filter((i) => i.done).length / items.length) * 100), items };
}
