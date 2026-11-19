import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminApi, usersApi } from '../../api/endpoints';
import type { AuditLogQuery, IsoDate, ListStaffQuery } from '../../api/types';
import { cabinetKeys } from '../cabinet/queries';

// Admin reads sit under the private prefix too: a staff change or an
// assignment invalidates them with everything else, and sign-out clears them.
export const adminKeys = {
  all: [...cabinetKeys.all, 'admin'] as const,
  dashboard: (range: { from: IsoDate; to: IsoDate }) =>
    [...adminKeys.all, 'dashboard', range] as const,
  staff: (query: ListStaffQuery) => [...adminKeys.all, 'staff', query] as const,
  audit: (query: AuditLogQuery) => [...adminKeys.all, 'audit', query] as const,
};

export function useDashboard(range: { from: IsoDate; to: IsoDate }) {
  return useQuery({
    queryKey: adminKeys.dashboard(range),
    queryFn: ({ signal }) => adminApi.dashboard(range, signal),
    placeholderData: keepPreviousData,
  });
}

export function useStaff(query: ListStaffQuery) {
  return useQuery({
    queryKey: adminKeys.staff(query),
    queryFn: ({ signal }) => usersApi.listStaff(query, signal),
    placeholderData: keepPreviousData,
  });
}

// Choices for pickers (agent assignment, the audit actor): the first 50 by
// name, which covers a portfolio-sized team.
export function useStaffOptions(query: ListStaffQuery) {
  return useQuery({
    queryKey: adminKeys.staff({ ...query, pageSize: 50 }),
    queryFn: ({ signal }) => usersApi.listStaff({ ...query, pageSize: 50 }, signal),
    staleTime: 60_000,
  });
}

export function useAudit(query: AuditLogQuery) {
  return useQuery({
    queryKey: adminKeys.audit(query),
    queryFn: ({ signal }) => adminApi.audit(query, signal),
    placeholderData: keepPreviousData,
  });
}
