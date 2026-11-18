import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { claimsApi, customersApi, policiesApi, staffApi, vehiclesApi } from '../../api/endpoints';
import type { Guid, ListClaimsQuery, ListCustomersQuery, ListPoliciesQuery } from '../../api/types';
import { cabinetKeys } from '../cabinet/queries';

// Staff reads live under the same private prefix as the client cabinet: one
// invalidation after a write (a decision, a sale) refreshes every list,
// detail and count, and sign-out clears them with the rest.
export const staffKeys = {
  all: [...cabinetKeys.all, 'staff'] as const,
  overview: () => [...staffKeys.all, 'overview'] as const,
  queue: (query: ListClaimsQuery) => [...staffKeys.all, 'queue', query] as const,
  claim: (id: Guid) => [...staffKeys.all, 'claim', id] as const,
  customers: (query: ListCustomersQuery) => [...staffKeys.all, 'customers', query] as const,
  customer: (id: Guid) => [...staffKeys.all, 'customer', id] as const,
  vehicles: (customerId: Guid) => [...staffKeys.all, 'vehicles', customerId] as const,
  sales: (query: ListPoliciesQuery) => [...staffKeys.all, 'sales', query] as const,
};

export function useStaffOverview() {
  return useQuery({
    queryKey: staffKeys.overview(),
    queryFn: ({ signal }) => staffApi.overview(signal),
  });
}

export function useClaimQueue(query: ListClaimsQuery) {
  return useQuery({
    queryKey: staffKeys.queue(query),
    queryFn: ({ signal }) => claimsApi.list(query, signal),
    placeholderData: keepPreviousData,
    // Other adjusters take claims from the same queue.
    refetchInterval: 60_000,
  });
}

export function useStaffClaim(id: Guid) {
  return useQuery({
    queryKey: staffKeys.claim(id),
    queryFn: ({ signal }) => claimsApi.get(id, signal),
    // A 404 here is an answer (not in your reach), not a blip to retry.
    retry: (count, error) =>
      count < 2 && !(error instanceof Error && 'status' in error && error.status === 404),
  });
}

export function useCustomers(query: ListCustomersQuery) {
  return useQuery({
    queryKey: staffKeys.customers(query),
    queryFn: ({ signal }) => customersApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: Guid) {
  return useQuery({
    queryKey: staffKeys.customer(id),
    queryFn: ({ signal }) => customersApi.get(id, signal),
    retry: (count, error) =>
      count < 2 && !(error instanceof Error && 'status' in error && error.status === 404),
  });
}

export function useCustomerVehicles(customerId: Guid) {
  return useQuery({
    queryKey: staffKeys.vehicles(customerId),
    queryFn: ({ signal }) => vehiclesApi.list(signal, customerId),
  });
}

export function useSales(query: ListPoliciesQuery) {
  return useQuery({
    queryKey: staffKeys.sales(query),
    queryFn: ({ signal }) => policiesApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}
