import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { cabinetApi, policiesApi, profileApi, vehiclesApi } from '../../api/endpoints';
import type { Guid, ListPoliciesQuery } from '../../api/types';

// Every private query sits under one prefix: a write invalidates the lot (a
// payment changes the list, the detail, the overview and the reminders), and
// sign-out clears the whole cache anyway.
export const cabinetKeys = {
  all: ['cabinet'] as const,
  overview: () => [...cabinetKeys.all, 'overview'] as const,
  reminders: () => [...cabinetKeys.all, 'reminders'] as const,
  policies: (query: ListPoliciesQuery) => [...cabinetKeys.all, 'policies', query] as const,
  policy: (id: Guid) => [...cabinetKeys.all, 'policy', id] as const,
  vehicles: () => [...cabinetKeys.all, 'vehicles'] as const,
  profile: () => [...cabinetKeys.all, 'profile'] as const,
};

export function useOverview() {
  return useQuery({
    queryKey: cabinetKeys.overview(),
    queryFn: ({ signal }) => cabinetApi.overview(signal),
  });
}

export function useReminders() {
  return useQuery({
    queryKey: cabinetKeys.reminders(),
    queryFn: ({ signal }) => cabinetApi.reminders(signal),
    // End dates move by the day; a few minutes stale is fine.
    staleTime: 5 * 60_000,
  });
}

export function usePolicies(query: ListPoliciesQuery) {
  return useQuery({
    queryKey: cabinetKeys.policies(query),
    queryFn: ({ signal }) => policiesApi.list(query, signal),
    // Keep the current page on screen while the next filter loads: no flash
    // of skeletons, no layout jump.
    placeholderData: keepPreviousData,
  });
}

export function usePolicy(id: Guid) {
  return useQuery({
    queryKey: cabinetKeys.policy(id),
    queryFn: ({ signal }) => policiesApi.get(id, signal),
  });
}

export function useVehicles() {
  return useQuery({
    queryKey: cabinetKeys.vehicles(),
    queryFn: ({ signal }) => vehiclesApi.list(signal),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: cabinetKeys.profile(),
    queryFn: ({ signal }) => profileApi.get(signal),
  });
}

export function useInvalidateCabinet() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: cabinetKeys.all }),
    [queryClient],
  );
}
