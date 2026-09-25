import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminCompanyDTO,
  ApplicationDTO,
  ManagedJobDTO,
  ReportSummaryDTO,
  Role,
  TimeSeriesPointDTO,
  TopCompanyDTO,
  TopJobDTO,
  UserDTO
} from '@jobportal/shared';
import { getPage, http } from '../../shared/api/http';

const PAGE_SIZE = 25;

// Admin tables are paged; keeping the previous page visible avoids flicker while the next one loads.
export const useAdminUsers = (page: number, role: Role | '') =>
  useQuery({
    queryKey: ['admin', 'users', page, role],
    queryFn: () => getPage<UserDTO>('/admin/users', { page, limit: PAGE_SIZE, role }),
    placeholderData: keepPreviousData
  });

export const useAdminCompanies = (page: number) =>
  useQuery({
    queryKey: ['admin', 'companies', page],
    queryFn: () => getPage<AdminCompanyDTO>('/admin/companies', { page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData
  });

export const useAdminJobs = (page: number) =>
  useQuery({
    queryKey: ['admin', 'jobs', page],
    queryFn: () => getPage<ManagedJobDTO>('/admin/jobs', { page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData
  });

export const useAdminApplications = (page: number) =>
  useQuery({
    queryKey: ['admin', 'applications', page],
    queryFn: () => getPage<ApplicationDTO>('/admin/applications', { page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData
  });

export function useAdminMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  return {
    setActive: useMutation({
      mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
        (await http.patch<UserDTO>(`/admin/users/${id}`, { isActive })).data,
      onSuccess: refresh
    }),
    deleteUser: useMutation({ mutationFn: async (id: string) => (await http.delete(`/admin/users/${id}`)).data, onSuccess: refresh }),
    deleteCompany: useMutation({
      mutationFn: async (id: string) => (await http.delete(`/admin/companies/${id}`)).data,
      onSuccess: refresh
    }),
    setJobStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: 'OPEN' | 'CLOSED' }) =>
        (await http.patch<ManagedJobDTO>(`/admin/jobs/${id}`, { status })).data,
      onSuccess: refresh
    }),
    deleteJob: useMutation({ mutationFn: async (id: string) => (await http.delete(`/admin/jobs/${id}`)).data, onSuccess: refresh })
  };
}

export interface Reports {
  summary: ReportSummaryDTO;
  byStatus: Array<{ status: string; count: number }>;
  overTime: TimeSeriesPointDTO[];
  topJobs: TopJobDTO[];
  topCompanies: TopCompanyDTO[];
}

export const useReports = () =>
  useQuery({
    queryKey: ['admin', 'reports'],
    staleTime: 30_000,
    queryFn: async (): Promise<Reports> => {
      const [summary, overTime, topJobs, topCompanies] = await Promise.all([
        http.get<ReportSummaryDTO>('/reports/summary'),
        http.get<TimeSeriesPointDTO[]>('/reports/applications-over-time', { params: { days: 90 } }),
        http.get<TopJobDTO[]>('/reports/top-jobs'),
        http.get<TopCompanyDTO[]>('/reports/top-companies')
      ]);
      return {
        summary: summary.data,
        byStatus: Object.entries(summary.data.applicationsByStatus).map(([status, count]) => ({ status, count })),
        overTime: overTime.data,
        topJobs: topJobs.data,
        topCompanies: topCompanies.data
      };
    }
  });
