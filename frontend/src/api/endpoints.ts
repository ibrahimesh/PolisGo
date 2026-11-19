import { request } from './http';
import type {
  AdminDashboardResponse,
  ApproveClaimRequest,
  AuditEventResponse,
  AuditLogQuery,
  ChangeRoleRequest,
  IsoDate,
  ListStaffQuery,
  StaffMemberResponse,
  AuthResponse,
  CalculateQuoteRequest,
  ChangePasswordRequest,
  ClaimDetailResponse,
  ClaimHistoryEntry,
  ClaimResponse,
  ClaimUpdateResponse,
  ClientOverviewResponse,
  CreatePolicyRequest,
  CreateStaffUserRequest,
  CreateVehicleRequest,
  CurrentUserResponse,
  CustomerDetailResponse,
  CustomerListItem,
  Guid,
  ListCustomersQuery,
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
  StaffOverviewResponse,
  SubmitClaimRequest,
  UpdateProfileRequest,
  WithdrawClaimRequest,
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
    request<undefined>('/api/me/change-password', { method: 'POST', body }),
};

// Client-only read models; staff get 403.
export const cabinetApi = {
  overview: (signal?: Signal) => request<ClientOverviewResponse>('/api/me/overview', { signal }),
  reminders: (signal?: Signal) => request<ReminderResponse[]>('/api/me/reminders', { signal }),
  markRead: (policyId: Guid) =>
    request<undefined>(`/api/me/reminders/${policyId}/read`, { method: 'POST' }),
  markAllRead: () => request<undefined>('/api/me/reminders/read-all', { method: 'POST' }),
  // Status changes someone else made on the client's claims.
  claimUpdates: (signal?: Signal) =>
    request<ClaimUpdateResponse[]>('/api/me/claim-updates', { signal }),
  markClaimUpdateRead: (claimId: Guid) =>
    request<undefined>(`/api/me/claim-updates/${claimId}/read`, { method: 'POST' }),
  markAllClaimUpdatesRead: () =>
    request<undefined>('/api/me/claim-updates/read-all', { method: 'POST' }),
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
  // Staff pass a customer of theirs; Clients always get their own.
  list: (signal?: Signal, customerId?: Guid) =>
    request<VehicleResponse[]>('/api/vehicles', { query: { customerId }, signal }),
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
  // Agents and Admins: the list's filters as a UTF-8 CSV.
  exportCsv: (query: ListPoliciesQuery = {}) =>
    request<Blob>('/api/policies/export', { query: { ...query }, responseType: 'blob' }),
};

export const claimsApi = {
  list: (query: ListClaimsQuery = {}, signal?: Signal) =>
    request<PagedResult<ClaimResponse>>('/api/claims', { query: { ...query }, signal }),
  get: (id: Guid, signal?: Signal) => request<ClaimDetailResponse>(`/api/claims/${id}`, { signal }),
  history: (id: Guid, signal?: Signal) =>
    request<ClaimHistoryEntry[]>(`/api/claims/${id}/history`, { signal }),
  submit: (body: SubmitClaimRequest) =>
    request<ClaimResponse>('/api/claims', { method: 'POST', body }),
  withdraw: (id: Guid, body: WithdrawClaimRequest = {}) =>
    request<ClaimResponse>(`/api/claims/${id}/withdraw`, { method: 'POST', body }),
  // Uploads go through uploadClaimDocument (XHR, for progress).
  downloadDocument: (id: Guid, documentId: Guid) =>
    request<Blob>(`/api/claims/${id}/documents/${documentId}`, { responseType: 'blob' }),
  review: (id: Guid, body: ReviewClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/review`, { method: 'POST', body }),
  approve: (id: Guid, body: ApproveClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/approve`, { method: 'POST', body }),
  reject: (id: Guid, body: RejectClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/reject`, { method: 'POST', body }),
  pay: (id: Guid, body: PayClaimRequest) =>
    request<ClaimResponse>(`/api/claims/${id}/pay`, { method: 'POST', body }),
  // Adjusters and Admins: the queue's filters as a UTF-8 CSV.
  exportCsv: (query: ListClaimsQuery = {}) =>
    request<Blob>('/api/claims/export', { query: { ...query }, responseType: 'blob' }),
};

// Staff only; rows are scoped to the caller's book or reach (404 outside it).
export const customersApi = {
  list: (query: ListCustomersQuery = {}, signal?: Signal) =>
    request<PagedResult<CustomerListItem>>('/api/customers', { query: { ...query }, signal }),
  get: (id: Guid, signal?: Signal) =>
    request<CustomerDetailResponse>(`/api/customers/${id}`, { signal }),
  // Admin only; null releases the customer.
  assignAgent: (id: Guid, agentId: Guid | null) =>
    request<undefined>(`/api/customers/${id}/agent`, { method: 'PUT', body: { agentId } }),
};

export const staffApi = {
  overview: (signal?: Signal) => request<StaffOverviewResponse>('/api/staff/overview', { signal }),
};

// Admin only.
export const usersApi = {
  listStaff: (query: ListStaffQuery = {}, signal?: Signal) =>
    request<PagedResult<StaffMemberResponse>>('/api/users/staff', { query: { ...query }, signal }),
  createStaff: (body: CreateStaffUserRequest) =>
    request<StaffMemberResponse>('/api/users/staff', { method: 'POST', body }),
  deactivate: (id: Guid) =>
    request<StaffMemberResponse>(`/api/users/${id}/deactivate`, { method: 'POST' }),
  reactivate: (id: Guid) =>
    request<StaffMemberResponse>(`/api/users/${id}/reactivate`, { method: 'POST' }),
  changeRole: (id: Guid, body: ChangeRoleRequest) =>
    request<StaffMemberResponse>(`/api/users/${id}/role`, { method: 'PUT', body }),
};

// Admin only.
export const adminApi = {
  dashboard: (range: { from?: IsoDate; to?: IsoDate }, signal?: Signal) =>
    request<AdminDashboardResponse>('/api/admin/dashboard', { query: { ...range }, signal }),
  audit: (query: AuditLogQuery = {}, signal?: Signal) =>
    request<PagedResult<AuditEventResponse>>('/api/admin/audit', { query: { ...query }, signal }),
};

export const healthApi = {
  // /health answers plain text ("Healthy" / "Degraded" / "Unhealthy").
  check: (signal?: Signal) =>
    request<string>('/health', { signal, anonymous: true, responseType: 'text' }),
};
