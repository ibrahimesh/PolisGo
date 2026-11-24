import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { errorsApi } from '../../../api/errorsEndpoints';
import type { ErrorListQuery, Guid, UpdateErrorStatusRequest } from '../../../api/types';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { adminKeys } from '../queries';

// Under the admin prefix, so sign-out clears them and a triage change
// refreshes the lists, the summary and the audit log together.
export const systemKeys = {
  all: [...adminKeys.all, 'system'] as const,
  health: () => [...systemKeys.all, 'health'] as const,
  summary: () => [...systemKeys.all, 'summary'] as const,
  errors: (query: ErrorListQuery) => [...systemKeys.all, 'errors', query] as const,
  error: (id: Guid) => [...systemKeys.all, 'error', id] as const,
  lookup: (reference: string) => [...systemKeys.all, 'lookup', reference] as const,
};

// Health is "now": refreshed every 30 seconds while the page is open.
export function useSystemHealth() {
  return useQuery({
    queryKey: systemKeys.health(),
    queryFn: ({ signal }) => errorsApi.health(signal),
    refetchInterval: 30_000,
  });
}

export function useErrorSummary() {
  return useQuery({
    queryKey: systemKeys.summary(),
    queryFn: ({ signal }) => errorsApi.summary(signal),
  });
}

export function useErrorGroups(query: ErrorListQuery) {
  return useQuery({
    queryKey: systemKeys.errors(query),
    queryFn: ({ signal }) => errorsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useErrorGroup(id: Guid) {
  return useQuery({
    queryKey: systemKeys.error(id),
    queryFn: ({ signal }) => errorsApi.get(id, signal),
  });
}

export function useErrorLookup(reference: string) {
  return useQuery({
    queryKey: systemKeys.lookup(reference),
    queryFn: ({ signal }) => errorsApi.lookup(reference, signal),
    retry: false,
  });
}

export function useUpdateErrorStatus() {
  const invalidate = useInvalidateCabinet();
  return useMutation({
    mutationFn: ({ id, body }: { id: Guid; body: UpdateErrorStatusRequest }) =>
      errorsApi.updateStatus(id, body),
    onSettled: () => invalidate(),
  });
}
