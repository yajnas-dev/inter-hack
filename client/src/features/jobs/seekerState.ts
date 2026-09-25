import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobListItemDTO } from '@jobportal/shared';
import { http } from '../../shared/api/http';
import { useAuth } from '../auth/AuthContext';
import { useMyApplications } from '../applications/api';

export const savedKeys = {
  ids: ['saved', 'ids'] as const,
  list: (page: number) => ['saved', 'list', page] as const
};

/**
 * Per-user state (bookmarks, applied jobs) is fetched separately and merged into the anonymous,
 * cached job lists on the client, so the public cache never has to know who is looking.
 */
export function useSeekerJobState() {
  const { user } = useAuth();
  const isSeeker = user?.role === 'JOB_SEEKER';
  const queryClient = useQueryClient();

  const ids = useQuery({
    queryKey: savedKeys.ids,
    enabled: isSeeker,
    queryFn: async () => (await http.get<{ ids: string[] }>('/seekers/me/saved/ids')).data.ids
  });
  const applications = useMyApplications({ enabled: isSeeker });

  const toggle = useMutation({
    mutationFn: async ({ jobId, save }: { jobId: string; save: boolean }) => {
      if (save) await http.put(`/seekers/me/saved/${jobId}`);
      else await http.delete(`/seekers/me/saved/${jobId}`);
    },
    // Optimistic: the heart flips instantly and rolls back if the request fails.
    onMutate: async ({ jobId, save }) => {
      await queryClient.cancelQueries({ queryKey: savedKeys.ids });
      const previous = queryClient.getQueryData<string[]>(savedKeys.ids);
      queryClient.setQueryData<string[]>(savedKeys.ids, (old = []) =>
        save ? [...new Set([...old, jobId])] : old.filter((id) => id !== jobId)
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => queryClient.setQueryData(savedKeys.ids, ctx?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['saved', 'list'] })
  });

  const saved = new Set(ids.data ?? []);
  const applied = new Set((applications.data ?? []).map((a) => a.job.id));
  return { isSeeker, saved, applied, toggleSave: (jobId: string) => toggle.mutate({ jobId, save: !saved.has(jobId) }) };
}

export function useSavedJobs(page: number, enabled: boolean) {
  return useQuery({
    queryKey: savedKeys.list(page),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ jobs: JobListItemDTO[]; total: number; page: number; limit: number }>('/seekers/me/saved', {
          params: { page, limit: 20 }
        })
      ).data
  });
}
