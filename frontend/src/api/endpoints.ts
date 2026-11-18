import { request } from './http';
import type {
  ApproveClaimRequest,
  AuthResponse,
  CalculateQuoteRequest,
  ChangePasswordRequest,
  ClaimDetailResponse,
  ClaimHistoryEntry,
  ClaimResponse,
  ClientOverviewResponse,
  CreatePolicyRequest,
  CreateStaffUserRequest,
  CreateVehicleRequest,
  CurrentUserResponse,
  Guid,
  ListPoliciesQuery,
  ListClaimsQuery,
  LoginRequest,
  PagedResult,
  PayClaimRequest,
  PayPolicyResponse,
  PolicyDetailResponse,
  PolicyResponse,
  PolicyTypeResponse,
  PremiumBreakdown,
  ProfileResponse,
  RegisterRequest,
  ReminderResponse,
  RejectClaimRequest,
  ReviewClaimRequest,
  SubmitClaimRequest,
  UpdateProfileRequest,
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

export const profileApi = {
  get: (signal?: Signal) => request<ProfileResponse>('/api/me', { signal }),
  update: (body: UpdateProfileRequest) =>
    request<ProfileResponse>('/api/me', { method: 'PUT', body }),
  changePassword: (body: ChangePasswordRequest) =>
    request<void>('/api/me/change-password', { method: 'POST', body }),
};

// Client-only read models; staff get 403.
export const cabinetApi = {
  overview: (signal?: Signal) => request<ClientOverviewResponse>('/api/me/overview', { signal }),
  reminders: (signal?: Signal) => request<ReminderResponse[]>('/api/me/reminders', { signal }),
  markRead: (policyId: Guid) =>
    request<void>(`/api/me/reminders/${policyId}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/api/me/reminders/read-all', { method: 'POST' }),
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
  list: (query: ListPoliciesQuery = {}, signal?: Signal) =>
    request<PagedResult<PolicyResponse>>('/api/policies', { query: { ...query }, signal }),
  get: (id: Guid, signal?: Signal) =>
    request<PolicyDetailResponse>(`/api/policies/${id}`, { signal }),
  // Priced from the customer's stored data: the premium that will be charged.
  quote: (body: CreatePolicyRequest, signal?: Signal) =>
    request<PremiumBreakdown>('/api/policies/quote', { method: 'POST', body, signal }),
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
