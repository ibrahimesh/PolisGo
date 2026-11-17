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

// Seeded by PolicyTypeConfiguration; the API has no catalog endpoint yet.
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
  status: PolicyStatus;
  createdAt: IsoDateTime;
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
