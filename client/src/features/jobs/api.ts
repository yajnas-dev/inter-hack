import { keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EmploymentType,
  JobCreateBody,
  JobDetailDTO,
  JobFacetsDTO,
  JobListItemDTO,
  JobUpdateBody,
  ManagedJobDTO,
  MatchAnalysisDTO
} from '@jobportal/shared';
import { getPage, http, type Page } from '../../shared/api/http';

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
    sort: f.sort === 'salary' ? '-salaryMax' : ''
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

/**
 * Keyset-cursor paging for every ordering: each page's `meta.nextCursor` fetches the next one, O(1) at any
 * depth. The first page also carries the total.
 */
export function useJobSearch(filters: JobFilters) {
  return useInfiniteQuery({
    queryKey: jobKeys.search(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getPage<JobListItemDTO>('/jobs', { ...filterParams(filters), limit: 20, cursor: pageParam }),
    getNextPageParam: (last: Page<JobListItemDTO>) => last.meta.nextCursor ?? undefined,
    staleTime: 15_000,
    placeholderData: keepPreviousData
  });
}

const fetchJob = async (id: string) => (await http.get<JobDetailDTO>(`/jobs/${id}`)).data;
const fetchSimilar = async (id: string) => (await http.get<JobListItemDTO[]>(`/jobs/${id}/similar`)).data;

/** Warm the cache for a job the user is about to open (hover/focus on its card). */
export function prefetchJob(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery({ queryKey: jobKeys.detail(id), queryFn: () => fetchJob(id), staleTime: 15_000 });
  void queryClient.prefetchQuery({ queryKey: jobKeys.similar(id), queryFn: () => fetchSimilar(id), staleTime: 60_000 });
}

export function useJob(id: string | undefined) {
  return useQuery({ queryKey: jobKeys.detail(id ?? ''), enabled: Boolean(id), queryFn: () => fetchJob(id!), staleTime: 15_000 });
}

export function useSimilarJobs(id: string | undefined) {
  return useQuery({ queryKey: jobKeys.similar(id ?? ''), enabled: Boolean(id), queryFn: () => fetchSimilar(id!), staleTime: 60_000 });
}

export function useFacets() {
  return useQuery({
    queryKey: jobKeys.facets,
    queryFn: async () => (await http.get<JobFacetsDTO>('/jobs/facets')).data,
    staleTime: 5 * 60_000
  });
}

/** The recruiter's company jobs (all statuses) with applicant counts. */
export function useMyJobs() {
  return useQuery({ queryKey: jobKeys.mine, queryFn: () => getPage<ManagedJobDTO>('/users/me/jobs', { limit: 100 }) });
}

export function useJobMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: jobKeys.all });
  const setStatus = async (id: string, status: 'OPEN' | 'CLOSED') => (await http.patch<ManagedJobDTO>(`/jobs/${id}`, { status })).data;

  return {
    create: useMutation({
      mutationFn: async (body: JobCreateBody) => (await http.post<ManagedJobDTO>('/jobs', body)).data,
      onSuccess: invalidate
    }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: JobUpdateBody }) => (await http.patch<ManagedJobDTO>(`/jobs/${id}`, body)).data,
      onSuccess: invalidate
    }),
    close: useMutation({ mutationFn: (id: string) => setStatus(id, 'CLOSED'), onSuccess: invalidate }),
    reopen: useMutation({ mutationFn: (id: string) => setStatus(id, 'OPEN'), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: async (id: string) => (await http.delete(`/jobs/${id}`)).data, onSuccess: invalidate })
  };
}

/** AI (or rule-based fallback) analysis of the signed-in seeker's fit for a job. */
export function useJobMatch(jobId: string) {
  return useMutation({ mutationFn: async () => (await http.post<MatchAnalysisDTO>(`/jobs/${jobId}/match`)).data });
}
