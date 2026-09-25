import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationsDTO } from '@jobportal/shared';
import { http } from '../../shared/api/http';
import { useAuth } from '../auth/AuthContext';

export const notificationKeys = {
  unread: ['notifications', 'unread'] as const,
  list: ['notifications', 'list'] as const
};

/**
 * Cheap polling for the bell badge: one small count query every 60 s, only while signed in and the tab is
 * visible (react-query pauses interval refetching in background tabs).
 */
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unread,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    queryFn: async () => (await http.get<{ unread: number }>('/notifications/unread-count')).data.unread
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list,
    enabled,
    queryFn: async () => (await http.get<NotificationsDTO>('/notifications', { params: { limit: 30 } })).data
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ids?: string[]; all?: boolean }) => (await http.post<{ unread: number }>('/notifications/read', body)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.unread, data.unread);
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    }
  });
}
