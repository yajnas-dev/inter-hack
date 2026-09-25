import type { ApplicationStatus } from './enums';

/**
 * Forward path: APPLIED -> SHORTLISTED -> INTERVIEW -> SELECTED.
 * REJECTED is reachable from APPLIED, SHORTLISTED or INTERVIEW, never from SELECTED.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  APPLIED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED'],
  SELECTED: [],
  REJECTED: []
};

export function nextStatuses(current: ApplicationStatus): readonly ApplicationStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function isValidTransition(current: ApplicationStatus, next: ApplicationStatus): boolean {
  return nextStatuses(current).includes(next);
}
