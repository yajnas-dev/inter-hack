import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPLOYMENT_TYPES, type EmploymentType } from '@jobportal/shared';
import { emptyFilters, type JobFilters } from './api';

const isType = (v: string): v is EmploymentType => (EMPLOYMENT_TYPES as readonly string[]).includes(v);

/**
 * The search state lives in the URL, so a search is shareable, survives reloads, and the back button
 * steps through filter changes. `job` is the job open in the detail pane.
 */
export function useJobFilters() {
  const [params, setParams] = useSearchParams();

  const filters: JobFilters = useMemo(
    () => ({
      ...emptyFilters,
      title: params.get('title') ?? '',
      location: params.get('location') ?? '',
      skills: params.get('skills') ?? '',
      experience: params.get('experience') ?? '',
      employmentType: (params.get('employmentType') ?? '').split(',').filter(isType),
      postedWithin: params.get('postedWithin') ?? '',
      minSalary: params.get('minSalary') ?? '',
      sort: params.get('sort') === 'salary' ? 'salary' : 'newest'
    }),
    [params]
  );
  const selectedId = params.get('job');

  const write = useCallback(
    (next: JobFilters, job: string | null) => {
      const out = new URLSearchParams();
      if (next.title) out.set('title', next.title);
      if (next.location) out.set('location', next.location);
      if (next.skills) out.set('skills', next.skills);
      if (next.experience) out.set('experience', next.experience);
      if (next.employmentType.length) out.set('employmentType', next.employmentType.join(','));
      if (next.postedWithin) out.set('postedWithin', next.postedWithin);
      if (next.minSalary) out.set('minSalary', next.minSalary);
      if (next.sort !== 'newest') out.set('sort', next.sort);
      if (job) out.set('job', job);
      setParams(out, { replace: true });
    },
    [setParams]
  );

  return {
    filters,
    selectedId,
    /** Changing any filter closes the detail pane selection (it may no longer be in the results). */
    update: (patch: Partial<JobFilters>) => write({ ...filters, ...patch }, null),
    clear: () => write(emptyFilters, null),
    select: (id: string | null) => write(filters, id)
  };
}

export function activeFilterCount(f: JobFilters): number {
  return (
    [f.title, f.location, f.skills, f.experience, f.postedWithin, f.minSalary].filter(Boolean).length + (f.employmentType.length ? 1 : 0)
  );
}
