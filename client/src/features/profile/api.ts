import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyBody, CompanyDTO, ResumeDTO, SeekerProfileBody, SeekerProfileDTO } from '@jobportal/shared';
import { http, saveBlob } from '../../shared/api/http';

export const profileKeys = {
  seeker: ['profile', 'seeker'] as const,
  recruiter: ['profile', 'recruiter'] as const
};

export interface RecruiterProfileDTO {
  id: string;
  designation?: string;
  phone?: string;
  company: CompanyDTO | null;
}

// ---- job seeker ----------------------------------------------------------------------------

export function useSeekerProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: profileKeys.seeker,
    enabled,
    queryFn: async () => (await http.get<{ profile: SeekerProfileDTO }>('/seekers/me')).data.profile
  });
}

export function useSaveSeekerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SeekerProfileBody) => (await http.put<{ profile: SeekerProfileDTO }>('/seekers/me', body)).data.profile,
    onSuccess: (profile) => queryClient.setQueryData(profileKeys.seeker, profile)
  });
}

export function useResumeMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: profileKeys.seeker });
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData();
        form.append('resume', file);
        return (await http.post<{ resume: ResumeDTO }>('/seekers/me/resume', form)).data.resume;
      },
      onSuccess: refresh
    }),
    remove: useMutation({ mutationFn: async () => (await http.delete('/seekers/me/resume')).data, onSuccess: refresh })
  };
}

export async function downloadMyResume(filename: string): Promise<void> {
  const { data } = await http.get<Blob>('/seekers/me/resume', { responseType: 'blob' });
  saveBlob(data, filename);
}

// ---- recruiter & company ---------------------------------------------------------------------

export function useRecruiterProfile() {
  return useQuery({
    queryKey: profileKeys.recruiter,
    queryFn: async () => (await http.get<{ profile: RecruiterProfileDTO }>('/recruiters/me')).data.profile
  });
}

export function useSaveCompany(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CompanyBody) =>
      (companyId
        ? await http.put<{ company: CompanyDTO }>(`/companies/${companyId}`, body)
        : await http.post<{ company: CompanyDTO }>('/companies', body)
      ).data.company,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.recruiter })
  });
}
