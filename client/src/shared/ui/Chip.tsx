import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ApplicationStatus } from '@jobportal/shared';
import { Icon } from './Icon';

/** A removable filter chip ("Pune x"). */
export function RemovableChip({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="chip chip-static active">
      {children}
      <button
        type="button"
        className="link-btn"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        style={{ display: 'inline-flex', color: 'inherit' }}
      >
        <Icon name="x" />
      </button>
    </span>
  );
}

/** A toggle chip; `pressed` drives the selected look and aria-pressed. */
export function ToggleChip({ pressed, children, ...rest }: { pressed: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} {...rest}>
      {children}
    </button>
  );
}

export const Tag = ({ children }: { children: ReactNode }) => <span className="tag">{children}</span>;

const LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  REJECTED: 'Rejected'
};
export const statusLabel = (s: ApplicationStatus): string => LABELS[s];

/** Colour is never the only signal: the stage name is always in the text. */
export function StatusPill({ status }: { status: ApplicationStatus }) {
  return <span className={`pill pill-${status}`}>{LABELS[status]}</span>;
}
