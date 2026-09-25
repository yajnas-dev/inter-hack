const DAY = 86_400_000;

/** "Just now", "5m ago", "3h ago", "2d ago", "3w ago", then a date. */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

export const isNew = (iso: string | undefined, days = 3): boolean =>
  Boolean(iso) && Date.now() - new Date(iso as string).getTime() < days * DAY;

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const formatMoney = (n: number): string => n.toLocaleString();
export const formatCompact = (n: number): string => compact.format(n);
export const formatSalary = (min: number, max: number): string => `${compact.format(min)} - ${compact.format(max)}`;

export const formatDate = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const formatDateTime = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  REMOTE: 'Remote'
};
export const employmentLabel = (t: string): string => EMPLOYMENT_LABELS[t] ?? t;
