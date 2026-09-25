import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EmploymentType,
  JobCreateBody,
  JobDetailDTO,
  JobFacetsDTO,
  JobListDTO,
  JobListItemDTO,
  JobUpdateBody
} from '@jobportal/shared';
import { http } from '../../shared/api/http';

export interface JobFilters {
  title: string;
  location: string;
  skills: string;
  experience: string;
  employmentType: EmploymentType[];
  postedWithin: string;
  minSalary: string;
  /** Set by company pages; not part of the search UI. */
  company: string;
  sort: 'newest' | 'salary';
}

export const emptyFilters: JobFilters = {
  title: '',
  location: '',
  skills: '',
  experience: '',
  employmentType: [],
  postedWithin: '',
  minSalary: '',
  company: '',
  sort: 'newest'
};

/** Query-string form of the filters (empty values dropped). */
export function filterParams(f: JobFilters): Record<string, string> {
  const params: Record<string, string> = {
    title: f.title,
    location: f.location,
    skills: f.skills,
    experience: f.experience,
    employmentType: f.employmentType.join(','),
    postedWithin: f.postedWithin,
    minSalary: f.minSalary,
    company: f.company,
    sort: f.sort === 'newest' ? '' : f.sort
  };
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== ''));
}

export const jobKeys = {
  all: ['jobs'] as const,
  search: (f: JobFilters) => ['jobs', 'search', filterParams(f)] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  similar: (id: string) => ['jobs', 'similar', id] as const,
  facets: ['jobs', 'facets'] as const,
  mine: ['jobs', 'mine'] as const
};

type Page = { cursor?: string; page?: number };

/**
 * Newest-first pages with an opaque cursor (O(1) at any depth); highest-salary order pages by number
 * because a keyset over salary is not stable enough to be worth the complexity.
 */
export function useJobSearch(filters: JobFilters) {
  return useInfiniteQuery({
    queryKey: jobKeys.search(filters),
    initialPageParam: {} as Page,
    queryFn: async ({ pageParam }) =>
      (
        await http.get<JobListDTO>('/jobs', {
          params: { ...filterParams(filters), limit: 20, cursor: pageParam.cursor, page: pageParam.page }
        })
      ).data,
    getNextPageParam: (last): Page | undefined => {
      if (last.nextCursor) return { cursor: last.nextCursor };
      if (filters.sort === 'salary' && last.page && last.total !== undefined && last.page * last.limit < last.total)
        return { page: last.page + 1 };
      return undefined;
    },
    staleTime: 15_000
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: jobKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await http.get<{ job: JobDetailDTO }>(`/jobs/${id}`)).data.job,
    staleTime: 15_000
  });
}

export function useSimilarJobs(id: string | undefined) {
  return useQuery({
    queryKey: jobKeys.similar(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await http.get<{ jobs: JobListItemDTO[] }>(`/jobs/${id}/similar`)).data.jobs,
    staleTime: 60_000
  });
}

export function useFacets() {
  return useQuery({
    queryKey: jobKeys.facets,
    queryFn: async () => (await http.get<JobFacetsDTO>('/jobs/facets')).data,
    staleTime: 5 * 60_000
  });
}

export function useMyJobs() {
  return useQuery({
    queryKey: jobKeys.mine,
    queryFn: async () => (await http.get<{ jobs: JobListItemDTO[]; total: number }>('/jobs/mine')).data
  });
}

export function useJobMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: jobKeys.all });

  return {
    create: useMutation({ mutationFn: async (body: JobCreateBody) => (await http.post('/jobs', body)).data, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: JobUpdateBody }) => (await http.put(`/jobs/${id}`, body)).data,
      onSuccess: invalidate
    }),
    close: useMutation({ mutationFn: async (id: string) => (await http.patch(`/jobs/${id}/close`)).data, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: async (id: string) => (await http.delete(`/jobs/${id}`)).data, onSuccess: invalidate })
  };
}
