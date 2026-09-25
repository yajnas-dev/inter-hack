import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompanyBody,
  CompanyDTO,
  RecruiterProfileBody,
  RecruiterProfileDTO,
  ResumeDTO,
  SeekerProfileBody,
  SeekerProfileDTO
} from '@jobportal/shared';
import { http, saveBlob } from '../../shared/api/http';

export type { RecruiterProfileDTO };

export const profileKeys = {
  seeker: ['profile', 'seeker'] as const,
  recruiter: ['profile', 'recruiter'] as const,
  resumes: ['resumes'] as const
};

// ---- job seeker ----------------------------------------------------------------------------

export function useSeekerProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: profileKeys.seeker,
    enabled,
    queryFn: async () => (await http.get<SeekerProfileDTO>('/users/me/profile')).data
  });
}

export function useSaveSeekerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SeekerProfileBody) => (await http.patch<SeekerProfileDTO>('/users/me/profile', body)).data,
    onSuccess: (profile) => queryClient.setQueryData(profileKeys.seeker, profile)
  });
}

export function useMyResumes({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: profileKeys.resumes, enabled, queryFn: async () => (await http.get<ResumeDTO[]>('/resumes')).data });
}

export function useResumeMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: profileKeys.seeker });
    void queryClient.invalidateQueries({ queryKey: profileKeys.resumes });
  };
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return (await http.post<ResumeDTO>('/resumes', form)).data;
      },
      onSuccess: refresh
    }),
    remove: useMutation({ mutationFn: async (id: string) => (await http.delete(`/resumes/${id}`)).data, onSuccess: refresh })
  };
}

export async function downloadMyResume(resume: Pick<ResumeDTO, 'id' | 'originalName'>): Promise<void> {
  const { data } = await http.get<Blob>(`/resumes/${resume.id}/file`, { responseType: 'blob' });
  saveBlob(data, resume.originalName);
}

// ---- recruiter & company ---------------------------------------------------------------------

export function useRecruiterProfile() {
  return useQuery({
    queryKey: profileKeys.recruiter,
    queryFn: async () => (await http.get<RecruiterProfileDTO>('/users/me/profile')).data
  });
}

export function useSaveRecruiterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RecruiterProfileBody) => (await http.patch<RecruiterProfileDTO>('/users/me/profile', body)).data,
    onSuccess: (profile) => queryClient.setQueryData(profileKeys.recruiter, profile)
  });
}

export function useSaveCompany(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CompanyBody) =>
      (companyId ? await http.patch<CompanyDTO>(`/companies/${companyId}`, body) : await http.post<CompanyDTO>('/companies', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.recruiter })
  });
}
