import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicantProfileDTO,
  ApplicationDTO,
  ApplicationStatus,
  ApplyBody,
  MatchAnalysisDTO,
  NoteDTO,
  RecruiterDashboardDTO
} from '@jobportal/shared';
import { getPage, http, saveBlob, type Page } from '../../shared/api/http';

export const applicationKeys = {
  all: ['applications'] as const,
  mine: ['applications', 'mine'] as const,
  detail: (id: string) => ['applications', 'detail', id] as const,
  forJob: (jobId: string) => ['applications', 'job', jobId] as const
};

/** The seeker's own applications (GET /applications is scoped to the caller). */
export function useMyApplications({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: applicationKeys.mine,
    enabled,
    queryFn: async () => (await getPage<ApplicationDTO>('/applications', { limit: 100 })).items
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await http.get<ApplicationDTO>(`/applications/${id}`)).data
  });
}

/** A job's applicants (the board shows every stage, so one page of up to 100). */
export function useJobApplicants(jobId: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.forJob(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async () => (await getPage<ApplicationDTO>(`/jobs/${jobId}/applications`, { limit: 100 })).items
  });
}

export function useApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ApplyBody) => (await http.post<ApplicationDTO>('/applications', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicationKeys.all })
  });
}

const patchStatus = async (id: string, status: ApplicationStatus) =>
  (await http.patch<ApplicationDTO>(`/applications/${id}`, { status })).data;

/** Moves one application; the board updates immediately and rolls back if the server refuses. */
export function useUpdateStatus(jobId: string) {
  const queryClient = useQueryClient();
  const key = applicationKeys.forJob(jobId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => patchStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApplicationDTO[]>(key);
      queryClient.setQueryData<ApplicationDTO[]>(key, (list) => list?.map((a) => (a.id === id ? { ...a, status } : a)));
      return { previous };
    },
    onError: (_err, _vars, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['recruiter', 'overview'] });
    }
  });
}

/** Moves several applications; reports how many the server accepted. */
export function useBulkUpdateStatus(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ApplicationStatus }) => {
      const results = await Promise.allSettled(ids.map((id) => patchStatus(id, status)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      return { ok, failed: ids.length - ok };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.forJob(jobId) });
      void queryClient.invalidateQueries({ queryKey: ['recruiter', 'overview'] });
    }
  });
}

/** Downloads a resume the caller is allowed to read (the API decides; it answers 404 otherwise). */
export async function downloadResume(resumeId: string, filename: string | undefined): Promise<void> {
  const { data } = await http.get<Blob>(`/resumes/${resumeId}/file`, { responseType: 'blob' });
  saveBlob(data, filename ?? 'resume');
}

/** The hiring company's view of an applicant's profile. */
export function useApplicantProfile(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['applications', 'applicant', applicationId ?? ''],
    enabled: Boolean(applicationId),
    queryFn: async () => (await http.get<ApplicantProfileDTO>(`/applications/${applicationId}/applicant`)).data
  });
}

export function useRecruiterOverview() {
  return useQuery({
    queryKey: ['recruiter', 'overview'],
    queryFn: async () => (await http.get<RecruiterDashboardDTO>('/users/me/dashboard')).data
  });
}

/** Move an application from anywhere (the overview queue spans several jobs); refreshes every list it can appear in. */
export function useQuickStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => patchStatus(id, status),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruiter', 'overview'] });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    }
  });
}

/** A recruiter's private notes on a candidate (never visible to the applicant). */
export function useNotes(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['applications', 'notes', applicationId ?? ''],
    enabled: Boolean(applicationId),
    queryFn: async () => (await http.get<NoteDTO[]>(`/applications/${applicationId}/notes`)).data
  });
}

export function useAddNote(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => (await http.post<NoteDTO>(`/applications/${applicationId}/notes`, { text })).data,
    onSuccess: (note) => queryClient.setQueryData<NoteDTO[]>(['applications', 'notes', applicationId ?? ''], (list = []) => [note, ...list])
  });
}

/** AI (or rule-based fallback) analysis of an applicant against the job, using the resume they sent. */
export function useApplicationMatch(applicationId: string) {
  return useMutation({ mutationFn: async () => (await http.post<MatchAnalysisDTO>(`/applications/${applicationId}/match`)).data });
}

export type { Page };
