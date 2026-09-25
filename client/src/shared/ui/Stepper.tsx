import type { ApplicationStatus } from '@jobportal/shared';

const STAGES: ApplicationStatus[] = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED'];
const NAMES: Record<string, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  REJECTED: 'Rejected'
};

/**
 * Where an application stands in Applied -> Shortlisted -> Interview -> Selected. A rejected application shows
 * the stages it reached and ends in a red "Rejected" step. State is conveyed by text as well as colour.
 */
export function ApplicationStepper({ status, reached }: { status: ApplicationStatus; reached?: ApplicationStatus[] }) {
  if (status === 'REJECTED') {
    const got = STAGES.filter((s) => reached?.includes(s));
    const steps = [...(got.length ? got : (['APPLIED'] as ApplicationStatus[])), 'REJECTED' as ApplicationStatus];
    return (
      <ol className="stepper" aria-label="Application progress: rejected">
        {steps.map((s) => (
          <li key={s} className={s === 'REJECTED' ? 'failed' : 'done'}>
            {NAMES[s]}
          </li>
        ))}
      </ol>
    );
  }
  const index = STAGES.indexOf(status);
  return (
    <ol className="stepper" aria-label={`Application progress: ${NAMES[status]}`}>
      {STAGES.map((s, i) => (
        <li key={s} className={i < index ? 'done' : i === index ? 'current' : ''} aria-current={i === index ? 'step' : undefined}>
          {NAMES[s]}
        </li>
      ))}
    </ol>
  );
}
