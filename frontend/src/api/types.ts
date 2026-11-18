// Hand-written mirror of the PolisGo API contract (PolisGo.Application/**/Dtos).
// The API serialises camelCase properties and enums as their string names.
// Dates: C# DateOnly -> "YYYY-MM-DD", DateTime -> ISO 8601 string.

export type IsoDate = string;
export type IsoDateTime = string;
export type Guid = string;

export const USER_ROLES = ['Client', 'Agent', 'Adjuster', 'Admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type PolicyStatus = 'Draft' | 'Active' | 'Expired' | 'Cancelled';
export type ClaimStatus = 'Submitted' | 'UnderReview' | 'Approved' | 'Rejected' | 'Paid';

// Seeded by PolicyTypeConfiguration; GET /api/policy-types lists them.
export const POLICY_TYPE_CODES = ['MTPL', 'CASCO'] as const;
export type PolicyTypeCode = (typeof POLICY_TYPE_CODES)[number];

/* ---- Auth ---- */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  birthDate: IsoDate;
  drivingLicenseDate: IsoDate;
}

export interface AuthResponse {
  token: string;
  expiresAt: IsoDateTime;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface CurrentUserResponse {
  id: Guid;
  email: string;
  fullName: string;
  role: UserRole;
}

// GET/PUT /api/me — customer fields are null for staff accounts.
export interface ProfileResponse {
  id: Guid;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  birthDate: IsoDate | null;
  drivingLicenseDate: IsoDate | null;
  createdAt: IsoDateTime;
}

export interface UpdateProfileRequest {
  fullName: string;
  phone: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateStaffUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: Exclude<UserRole, 'Client'>;
}

/* ---- Pricing ---- */

// GET /api/policy-types — the product catalogue (seeded PolicyTypes table).
export interface PolicyTypeResponse {
  id: Guid;
  code: string;
  name: string;
  description: string;
  baseRate: number;
  currency: string;
}

export interface CalculateQuoteRequest {
  policyTypeCode: PolicyTypeCode;
  engineCapacityCc: number;
  driverBirthDate: IsoDate;
  drivingLicenseDate: IsoDate;
  vehicleYear: number;
  claimsInLast3Years: number;
  termMonths: number;
}

export interface PremiumBreakdown {
  baseRate: number;
  engineFactor: number;
  driverAgeFactor: number;
  experienceFactor: number;
  vehicleAgeFactor: number;
  bonusMalusFactor: number;
  termFactor: number;
  totalFactor: number;
  premium: number;
  currency: string;
}

/* ---- Vehicles ---- */

export interface CreateVehicleRequest {
  make: string;
  model: string;
  year: number;
  engineCapacityCc: number;
  plateNumber: string;
  vin: string;
  customerId?: Guid | null;
}

export interface VehicleResponse {
  id: Guid;
  customerId: Guid;
  make: string;
  model: string;
  year: number;
  engineCapacityCc: number;
  plateNumber: string;
  vin: string;
}

/* ---- Policies ---- */

export interface CreatePolicyRequest {
  vehicleId: Guid;
  policyTypeCode: PolicyTypeCode;
  startDate: IsoDate;
  termMonths: number;
  customerId?: Guid | null;
}

export interface PolicyVehicleSummary {
  id: Guid;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
}

export interface PolicyResponse {
  id: Guid;
  policyNumber: string;
  customerId: Guid;
  vehicleId: Guid;
  policyTypeId: Guid;
  policyTypeCode: string;
  agentId: Guid | null;
  startDate: IsoDate;
  endDate: IsoDate;
  premium: number;
  currency: string;
  // Effective: an Active policy past its end date arrives as Expired.
  status: PolicyStatus;
  createdAt: IsoDateTime;
  vehicle: PolicyVehicleSummary;
}

export type PaymentMethod = 'Cash' | 'Card' | 'BankTransfer' | 'Online';
export type PaymentStatus = 'Pending' | 'Completed' | 'Failed' | 'Refunded';

export interface PolicyPaymentResponse {
  id: Guid;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: IsoDateTime;
  reference: string | null;
}

export interface PolicyHistoryEntry {
  fromStatus: PolicyStatus | null;
  toStatus: PolicyStatus;
  changedAt: IsoDateTime;
  // The derived Active -> Expired step that nobody performs.
  automatic: boolean;
}

// GET /api/policies/{id}
export interface PolicyDetailResponse {
  policy: PolicyResponse;
  holderName: string;
  vehicle: VehicleResponse;
  // Factors frozen at issue; null for policies issued before they were stored.
  pricing: PremiumBreakdown | null;
  payments: PolicyPaymentResponse[];
  history: PolicyHistoryEntry[];
}

export const POLICY_SORT_FIELDS = [
  'CreatedAt',
  'StartDate',
  'EndDate',
  'Premium',
  'PolicyNumber',
] as const;
export type PolicySortBy = (typeof POLICY_SORT_FIELDS)[number];
export type SortDirection = 'Asc' | 'Desc';

export interface ListPoliciesQuery {
  status?: PolicyStatus;
  type?: string;
  search?: string;
  sortBy?: PolicySortBy;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface PayPolicyResponse {
  policy: PolicyResponse;
  paymentId: Guid;
  amount: number;
  currency: string;
  reference: string;
  paidAt: IsoDateTime;
}

/* ---- Claims ---- */

export interface SubmitClaimRequest {
  policyId: Guid;
  incidentDate: IsoDateTime;
  description: string;
  claimedAmount: number;
  customerId?: Guid | null;
}

export interface ClaimResponse {
  id: Guid;
  claimNumber: string;
  policyId: Guid;
  policyNumber: string;
  incidentDate: IsoDateTime;
  description: string;
  claimedAmount: number;
  approvedAmount: number | null;
  status: ClaimStatus;
  assignedAdjusterId: Guid | null;
  createdAt: IsoDateTime;
}

export interface ClaimHistoryEntry {
  id: Guid;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  changedByUserId: Guid;
  comment: string;
  changedAt: IsoDateTime;
}

export interface ClaimDocumentResponse {
  id: Guid;
  fileName: string;
  uploadedAt: IsoDateTime;
}

export interface ClaimDetailResponse {
  claim: ClaimResponse;
  history: ClaimHistoryEntry[];
  documents: ClaimDocumentResponse[];
}

export interface ListClaimsQuery {
  status?: ClaimStatus;
  assignedToMe?: boolean;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}

export interface ReviewClaimRequest {
  comment?: string | null;
}
export interface ApproveClaimRequest {
  approvedAmount: number;
  comment: string;
}
export interface RejectClaimRequest {
  comment: string;
}
export interface PayClaimRequest {
  comment?: string | null;
}

/* ---- Common ---- */

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

// RFC 7807 body written by ExceptionHandlingMiddleware (and by ASP.NET's own
// model-binding 400s). traceId is always added as an extension member.
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}
