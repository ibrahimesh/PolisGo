import { request } from './http';
import type {
  ErrorGroupDetail,
  ErrorGroupRow,
  ErrorListQuery,
  ErrorLookupResponse,
  ErrorSummaryResponse,
  Guid,
  PagedResult,
  PurgeResolvedResponse,
  SystemHealthResponse,
  UpdateErrorStatusRequest,
} from './types';

type Signal = AbortSignal | undefined;

// Apart from endpoints.ts so that only the System section's lazy chunks
// carry it, never the landing page.
// The System section (Admin only).
export const errorsApi = {
  list: (query: ErrorListQuery = {}, signal?: Signal) =>
    request<PagedResult<ErrorGroupRow>>('/api/admin/errors', { query: { ...query }, signal }),
  summary: (signal?: Signal) =>
    request<ErrorSummaryResponse>('/api/admin/errors/summary', { signal }),
  lookup: (reference: string, signal?: Signal) =>
    request<ErrorLookupResponse>('/api/admin/errors/lookup', { query: { reference }, signal }),
  get: (id: Guid, signal?: Signal) =>
    request<ErrorGroupDetail>(`/api/admin/errors/${id}`, { signal }),
  updateStatus: (id: Guid, body: UpdateErrorStatusRequest) =>
    request<ErrorGroupDetail>(`/api/admin/errors/${id}`, { method: 'PATCH', body }),
  purgeResolved: (olderThanDays: number) =>
    request<PurgeResolvedResponse>('/api/admin/errors/resolved', {
      method: 'DELETE',
      query: { olderThanDays },
    }),
  health: (signal?: Signal) =>
    request<SystemHealthResponse>('/api/admin/system/health', { signal }),
};
