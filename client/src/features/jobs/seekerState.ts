import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobListItemDTO } from '@jobportal/shared';
import { getPage, http } from '../../shared/api/http';
import { useToast } from '../../shared/ui/toast';
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
  const toast = useToast();

  const ids = useQuery({
    queryKey: savedKeys.ids,
    enabled: isSeeker,
    queryFn: async () => (await http.get<string[]>('/users/me/saved-jobs/ids')).data
  });
  const applications = useMyApplications({ enabled: isSeeker });

  const toggle = useMutation({
    mutationFn: async ({ jobId, save }: { jobId: string; save: boolean }) => {
      if (save) await http.put(`/users/me/saved-jobs/${jobId}`);
      else await http.delete(`/users/me/saved-jobs/${jobId}`);
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
  const toggleSave = (jobId: string) => {
    const save = !saved.has(jobId);
    toggle.mutate({ jobId, save });
    if (!save) toast.success('Removed from saved jobs.', { label: 'Undo', onClick: () => toggle.mutate({ jobId, save: true }) });
  };
  return { isSeeker, saved, applied, toggleSave };
}

export function useSavedJobs(page: number, enabled: boolean) {
  return useQuery({
    queryKey: savedKeys.list(page),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { items, meta } = await getPage<JobListItemDTO>('/users/me/saved-jobs', { page, limit: 20 });
      return { jobs: items, total: meta.total ?? items.length, page: meta.page ?? page, limit: meta.limit };
    }
  });
}
