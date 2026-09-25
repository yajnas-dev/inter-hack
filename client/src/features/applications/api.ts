import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplicantProfileDTO, ApplicationDTO, ApplicationStatus, ApplyBody, RecruiterOverviewDTO } from '@jobportal/shared';
import { http, saveBlob } from '../../shared/api/http';

export const applicationKeys = {
  all: ['applications'] as const,
  mine: ['applications', 'mine'] as const,
  detail: (id: string) => ['applications', 'detail', id] as const,
  forJob: (jobId: string) => ['applications', 'job', jobId] as const
};

export function useMyApplications({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: applicationKeys.mine,
    enabled,
    queryFn: async () => (await http.get<{ applications: ApplicationDTO[] }>('/applications/mine')).data.applications
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await http.get<{ application: ApplicationDTO }>(`/applications/${id}`)).data.application
  });
}

export function useJobApplicants(jobId: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.forJob(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async () => (await http.get<{ applications: ApplicationDTO[] }>(`/jobs/${jobId}/applications`)).data.applications
  });
}

export function useApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ApplyBody) => (await http.post<{ application: ApplicationDTO }>('/applications', body)).data.application,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicationKeys.all })
  });
}

const patchStatus = async (id: string, status: ApplicationStatus) =>
  (await http.patch<{ application: ApplicationDTO }>(`/applications/${id}/status`, { status })).data.application;

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

export async function downloadApplicationResume(id: string, filename: string | undefined): Promise<void> {
  const { data } = await http.get<Blob>(`/applications/${id}/resume`, { responseType: 'blob' });
  saveBlob(data, filename ?? 'resume');
}

/** FR-06: the owning recruiter's view of an applicant's profile. */
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
    queryFn: async () => (await http.get<RecruiterOverviewDTO>('/recruiters/me/overview')).data
  });
}
