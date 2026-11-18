// Hand-written mirror of the PolisGo API contract (PolisGo.Application/**/Dtos).
// The API serialises camelCase properties and enums as their string names.
// Dates: C# DateOnly -> "YYYY-MM-DD", DateTime -> ISO 8601 string.

export type IsoDate = string;
export type IsoDateTime = string;
export type Guid = string;

export const USER_ROLES = ['Client', 'Agent', 'Adjuster', 'Admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type PolicyStatus = 'Draft' | 'Active' | 'Expired' | 'Cancelled';
export type ClaimStatus =
  'Submitted' | 'UnderReview' | 'Approved' | 'Rejected' | 'Paid' | 'Withdrawn';
export const CLAIM_STATUSES = [
  'Submitted',
  'UnderReview',
  'Approved',
  'Rejected',
  'Paid',
  'Withdrawn',
] as const satisfies readonly ClaimStatus[];
export const INCIDENT_TYPES = [
  'Collision',
  'Theft',
  'Vandalism',
  'Fire',
  'NaturalHazard',
  'Glass',
  'Other',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

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
  incidentDate: IsoDate;
  incidentType: IncidentType;
  location: string;
  description: string;
  claimedAmount: number;
  customerId?: Guid | null;
}

export interface ClaimResponse {
  id: Guid;
  claimNumber: string;
  policyId: Guid;
  policyNumber: string;
  policyTypeCode: string;
  incidentDate: IsoDateTime;
  // Null on claims filed before these were collected.
  incidentType: IncidentType | null;
  location: string | null;
  description: string;
  claimedAmount: number;
  approvedAmount: number | null;
  status: ClaimStatus;
  assignedAdjusterId: Guid | null;
  createdAt: IsoDateTime;
  // The latest status change.
  updatedAt: IsoDateTime;
}

export interface ClaimHistoryEntry {
  id: Guid;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  changedByUserId: Guid;
  changedByRole: UserRole;
  changedByName: string;
  comment: string;
  changedAt: IsoDateTime;
}

export interface ClaimDocumentResponse {
  id: Guid;
  fileName: string;
  contentType: string;
  uploadedAt: IsoDateTime;
}

export interface ClaimPolicySummary {
  id: Guid;
  policyNumber: string;
  policyTypeCode: string;
  startDate: IsoDate;
  endDate: IsoDate;
  vehicle: PolicyVehicleSummary;
}

export interface ClaimDetailResponse {
  claim: ClaimResponse;
  policy: ClaimPolicySummary;
  // Oldest first.
  history: ClaimHistoryEntry[];
  documents: ClaimDocumentResponse[];
  canWithdraw: boolean;
  canAddDocuments: boolean;
  maxDocuments: number;
}

export type ClaimSortBy = 'CreatedAt' | 'IncidentDate' | 'ClaimedAmount' | 'ClaimNumber';

export interface ListClaimsQuery {
  status?: ClaimStatus;
  // Submitted or UnderReview; ignored when status is set.
  open?: boolean;
  search?: string;
  sortBy?: ClaimSortBy;
  sortDir?: SortDirection;
  assignedToMe?: boolean;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}

export interface WithdrawClaimRequest {
  reason?: string | null;
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

/* ---- Client cabinet (/api/me) ---- */

// Active policy ending within 30 days with no follow-on policy yet.
export interface ReminderResponse {
  policyId: Guid;
  policyNumber: string;
  policyTypeCode: string;
  vehicle: PolicyVehicleSummary;
  endDate: IsoDate;
  // 0 on the last covered day.
  daysLeft: number;
  readAt: IsoDateTime | null;
}

export interface NextRenewalResponse {
  policyId: Guid;
  policyNumber: string;
  policyTypeCode: string;
  endDate: IsoDate;
  daysLeft: number;
}

export type ActivityKind = 'Policy' | 'Claim';

export interface ActivityEntry {
  kind: ActivityKind;
  subjectId: Guid;
  reference: string;
  // PolicyStatus or ClaimStatus names, depending on kind.
  fromStatus: string | null;
  toStatus: string;
  at: IsoDateTime;
}

export interface ClientOverviewResponse {
  activePolicies: number;
  awaitingPayment: number;
  nextRenewal: NextRenewalResponse | null;
  insuredVehicles: number;
  vehicles: number;
  paidLast12Months: number;
  currency: string;
  unreadReminders: number;
  recentActivity: ActivityEntry[];
  // Submitted or UnderReview.
  openClaims: number;
  unreadClaimUpdates: number;
  latestClaimUpdate: LatestClaimUpdate | null;
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

// The latest change someone else made on one of the client's claims.
export interface ClaimUpdateResponse {
  claimId: Guid;
  claimNumber: string;
  policyNumber: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  comment: string;
  changedAt: IsoDateTime;
  // Null while unread.
  readAt: IsoDateTime | null;
}

export interface LatestClaimUpdate {
  claimId: Guid;
  claimNumber: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  at: IsoDateTime;
}
