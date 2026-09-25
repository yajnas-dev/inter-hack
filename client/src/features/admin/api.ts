import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSummaryDTO, ApplicationDTO, CompanyDTO, Role, UserDTO } from '@jobportal/shared';
import { http } from '../../shared/api/http';

export interface Paged {
  total: number;
  page: number;
  limit: number;
}
export interface AdminJobRow {
  id: string;
  title: string;
  status: string;
  company: { name?: string };
  postedBy?: { name?: string };
}

const list = <R extends Paged>(path: string, page: number, extra: Record<string, unknown> = {}) =>
  http.get<R>(path, { params: { page, limit: 25, ...extra } }).then((r) => r.data);

// Admin tables are paged; keeping the previous page visible avoids flicker while the next one loads.
export const useAdminUsers = (page: number, role: Role | '') =>
  useQuery({
    queryKey: ['admin', 'users', page, role],
    queryFn: () => list<Paged & { users: UserDTO[] }>('/admin/users', page, role ? { role } : {}),
    placeholderData: keepPreviousData
  });

export const useAdminCompanies = (page: number) =>
  useQuery({
    queryKey: ['admin', 'companies', page],
    queryFn: () => list<Paged & { companies: CompanyDTO[] }>('/admin/companies', page),
    placeholderData: keepPreviousData
  });

export const useAdminJobs = (page: number) =>
  useQuery({
    queryKey: ['admin', 'jobs', page],
    queryFn: () => list<Paged & { jobs: AdminJobRow[] }>('/admin/jobs', page),
    placeholderData: keepPreviousData
  });

export const useAdminApplications = (page: number) =>
  useQuery({
    queryKey: ['admin', 'applications', page],
    queryFn: () => list<Paged & { applications: ApplicationDTO[] }>('/admin/applications', page),
    placeholderData: keepPreviousData
  });

export function useAdminMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  return {
    setActive: useMutation({
      mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
        (await http.patch(`/admin/users/${id}/status`, { isActive })).data,
      onSuccess: refresh
    }),
    deleteUser: useMutation({ mutationFn: async (id: string) => (await http.delete(`/admin/users/${id}`)).data, onSuccess: refresh }),
    deleteCompany: useMutation({
      mutationFn: async (id: string) => (await http.delete(`/admin/companies/${id}`)).data,
      onSuccess: refresh
    }),
    deleteJob: useMutation({ mutationFn: async (id: string) => (await http.delete(`/admin/jobs/${id}`)).data, onSuccess: refresh })
  };
}

export interface Reports {
  summary: AdminSummaryDTO;
  byStatus: Array<{ status: string; count: number }>;
  overTime: Array<{ date: string; count: number }>;
  topJobs: Array<{ jobId: string; title: string; company: string; applicantCount: number }>;
  topCompanies: Array<{ companyId: string; name: string; applicantCount: number }>;
}

export const useReports = () =>
  useQuery({
    queryKey: ['admin', 'reports'],
    staleTime: 30_000,
    queryFn: async (): Promise<Reports> => {
      const [summary, byStatus, overTime, topJobs, topCompanies] = await Promise.all([
        http.get<AdminSummaryDTO>('/admin/reports/summary'),
        http.get<{ results: Reports['byStatus'] }>('/admin/reports/applications-by-status'),
        http.get<{ results: Reports['overTime'] }>('/admin/reports/applications-over-time'),
        http.get<{ results: Reports['topJobs'] }>('/admin/reports/top-jobs'),
        http.get<{ results: Reports['topCompanies'] }>('/admin/reports/top-companies')
      ]);
      return {
        summary: summary.data,
        byStatus: byStatus.data.results,
        overTime: overTime.data.results,
        topJobs: topJobs.data.results,
        topCompanies: topCompanies.data.results
      };
    }
  });
