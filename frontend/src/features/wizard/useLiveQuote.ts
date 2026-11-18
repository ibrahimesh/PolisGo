import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { policiesApi } from '../../api/endpoints';
import type { PolicyTypeCode } from '../../api/types';
import { useDebouncedValue } from '../../lib/hooks';
import { cabinetKeys } from '../cabinet/queries';
import { createCoverSchema } from './wizardSchema';
import type { WizardValues } from './wizardState';

// Live premium from POST /api/policies/quote: the customer's stored data,
// the chosen vehicle and the same calculation as issuing, so the figure is
// the one that will be charged. Debounced; the previous figure stays on
// screen (dimmed) while the next one loads.
export function useLiveQuote(values: WizardValues) {
  const debounced = useDebouncedValue(values, 300);
  const ready = debounced.vehicleId !== '' && createCoverSchema().safeParse(debounced).success;
  return useQuery({
    queryKey: [...cabinetKeys.all, 'quote', debounced],
    queryFn: ({ signal }) =>
      policiesApi.quote(
        { ...debounced, policyTypeCode: debounced.policyTypeCode as PolicyTypeCode },
        signal,
      ),
    enabled: ready,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
