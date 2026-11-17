import { useQuery } from '@tanstack/react-query';
import { policyTypesApi } from '../../api/endpoints';

// The product catalogue changes rarely (the API caches it publicly for 5 min).
export function usePolicyTypes() {
  return useQuery({
    queryKey: ['policy-types'],
    queryFn: ({ signal }) => policyTypesApi.list(signal),
    staleTime: 5 * 60_000,
    // Cheapest first, which puts the mandatory product (MTPL) at the front.
    select: (types) => [...types].sort((a, b) => a.baseRate - b.baseRate),
  });
}
