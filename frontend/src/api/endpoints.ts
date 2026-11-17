import { request } from './http';
import type {
  ApproveClaimRequest,
  AuthResponse,
  CalculateQuoteRequest,
  ClaimDetailResponse,
  ClaimHistoryEntry,
  ClaimResponse,
  CreatePolicyRequest,
  CreateStaffUserRequest,
  CreateVehicleRequest,
  CurrentUserResponse,
  Guid,
  ListClaimsQuery,
  LoginRequest,
  PagedResult,
  PayClaimRequest,
  PayPolicyResponse,
  PolicyResponse,
  PolicyTypeResponse,
  PremiumBreakdown,
  RegisterRequest,
  RejectClaimRequest,
  ReviewClaimRequest,
  SubmitClaimRequest,
  VehicleResponse,
} from './types';

type Signal = AbortSignal | undefined;

export const authApi = {
  login: (body: LoginRequest) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body, anonymous: true }),
  register: (body: RegisterRequest) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body, anonymous: true }),
  me: (signal?: Signal) => request<CurrentUserResponse>('/api/auth/me', { signal }),
};

export const quotesApi = {
  calculate: (body: CalculateQuoteRequest, signal?: Signal) =>
    request<PremiumBreakdown>('/api/quotes/calculate', {
      method: 'POST',
      body,
      signal,
      anonymous: true,
    }),
};

export const policyTypesApi = {
  list: (signal?: Signal) =>
    request<PolicyTypeResponse[]>('/api/policy-types', { signal, anonymous: true }),
};

export const vehiclesApi = {
  list: (signal?: Signal) => request<VehicleResponse[]>('/api/vehicles', { signal }),
  create: (body: CreateVehicleRequest) =>
    request<VehicleResponse>('/api/vehicles', { method: 'POST', body }),
};

export const policiesApi = {
  list: (page = 1, pageSize = 20, signal?: Signal) =>
    request<PagedResult<PolicyResponse>>('/api/policies', { query: { page, pageSize }, signal }),
  get: (id: Guid, signal?: Signal) => request<PolicyResponse>(`/api/policies/${id}`, { signal }),
  create: (body: CreatePolicyRequest) =>
    request<PolicyResponse>('/api/policies', { method: 'POST', body }),
  pay: (id: Guid) => request<PayPolicyResponse>(`/api/policies/${id}/pay`, { method: 'POST' }),
  cancel: (id: Guid) => request<PolicyResponse>(`/api/policies/${id}/cancel`, { method: 'POST' }),
};

export const claimsApi = {
  list: (query: ListClaimsQuery = {}, signal?: Signal) =>
    request<PagedResult<ClaimResponse>>('/api/claims', { query: { ...query }, signal }),
  get: (id: Guid, signal?: Signal) => request<ClaimDetailResponse>(`/api/claims/${id}`, { signal }),
  history: (id: Guid, signal?: Signal) =>
    request<ClaimHistoryEntry[]>(`/api/claims/${id}/history`, { signal }),
  submit: (body: SubmitClaimRequest) =>
    request<ClaimResponse>('/api/claims', { method: 'POST', body }),
  review: (id: Guid, body: ReviewClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/review`, { method: 'POST', body }),
  approve: (id: Guid, body: ApproveClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/approve`, { method: 'POST', body }),
  reject: (id: Guid, body: RejectClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/reject`, { method: 'POST', body }),
  pay: (id: Guid, body: PayClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/pay`, { method: 'POST', body }),
};

export const usersApi = {
  createStaff: (body: CreateStaffUserRequest) =>
    request<CurrentUserResponse>('/api/users/staff', { method: 'POST', body }),
};

export const healthApi = {
  // /health answers plain text ("Healthy" / "Degraded" / "Unhealthy").
  check: (signal?: Signal) =>
    request<string>('/health', { signal, anonymous: true, responseType: 'text' }),
};
