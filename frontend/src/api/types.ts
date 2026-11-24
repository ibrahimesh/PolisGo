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
  // The policyholder as recorded on the customer.
  customerName: string;
  // Who sold it; null for self-service sales.
  agentName: string | null;
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
  agentId?: Guid;
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
  customerId: Guid;
  customerName: string;
  assignedAdjusterName: string | null;
  // Sent back with a decision; a stale one is a 409 "Concurrent update".
  rowVersion: Guid;
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

export interface ClaimCustomerSummary {
  id: Guid;
  fullName: string;
  email: string;
  phone: string;
}

export const CLAIM_ACTIONS = ['Review', 'Approve', 'Reject', 'Pay', 'Withdraw'] as const;
export type ClaimAction = (typeof CLAIM_ACTIONS)[number];

// ClaimActionBlock.cs: why an action is unavailable now.
export const CLAIM_ACTION_BLOCKS = [
  'AlreadyInReview',
  'StartReviewFirst',
  'AssignedToAnother',
  'AlreadyDecided',
  'NotApproved',
  'AlreadyPaid',
  'Withdrawn',
  'Closed',
  'OutsideYourBook',
] as const;
export type ClaimActionBlock = (typeof CLAIM_ACTION_BLOCKS)[number];

export interface ClaimActionState {
  action: ClaimAction;
  allowed: boolean;
  blockedReason: ClaimActionBlock | null;
}

export interface ClaimDetailResponse {
  claim: ClaimResponse;
  policy: ClaimPolicySummary;
  customer: ClaimCustomerSummary;
  // Oldest first.
  history: ClaimHistoryEntry[];
  documents: ClaimDocumentResponse[];
  canWithdraw: boolean;
  canAddDocuments: boolean;
  maxDocuments: number;
  // Every action of the caller's role, allowed or not.
  actions: ClaimActionState[];
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
// rowVersion: the claim's version as the caller last saw it.
export interface ReviewClaimRequest {
  comment?: string | null;
  rowVersion?: Guid;
}
export interface ApproveClaimRequest {
  approvedAmount: number;
  comment?: string | null;
  rowVersion?: Guid;
}
export interface RejectClaimRequest {
  comment: string;
  rowVersion?: Guid;
}
export interface PayClaimRequest {
  comment?: string | null;
  rowVersion?: Guid;
}

/* ---- Staff: customers and overview ---- */

export type CustomerSortBy = 'CreatedAt' | 'FullName' | 'Email';

export interface ListCustomersQuery {
  search?: string;
  sortBy?: CustomerSortBy;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
  // Admins: one agent's book, or customers nobody looks after.
  agentId?: Guid;
  unassigned?: boolean;
}

export interface CustomerListItem {
  id: Guid;
  fullName: string;
  email: string;
  phone: string;
  createdAt: IsoDateTime;
  hasAccount: boolean;
  vehicleCount: number;
  // Counts follow the caller's visibility (an agent's own sales).
  policyCount: number;
  activePolicyCount: number;
  claimCount: number;
  agentId: Guid | null;
  agentName: string | null;
}

export interface StatusCount<T extends string> {
  status: T;
  count: number;
}

export interface CustomerClaimsSummary {
  total: number;
  byStatus: StatusCount<ClaimStatus>[];
  claimedAmount: number;
  paidAmount: number;
  recent: ClaimResponse[];
}

export interface CustomerDetailResponse {
  id: Guid;
  fullName: string;
  email: string;
  phone: string;
  birthDate: IsoDate;
  drivingLicenseDate: IsoDate;
  createdAt: IsoDateTime;
  hasAccount: boolean;
  agentId: Guid | null;
  agentName: string | null;
  vehicles: VehicleResponse[];
  policies: PolicyResponse[];
  claims: CustomerClaimsSummary;
}

export interface RecentDecision {
  claimId: Guid;
  claimNumber: string;
  customerName: string;
  status: ClaimStatus;
  claimedAmount: number;
  approvedAmount: number | null;
  decidedBy: string;
  decidedAt: IsoDateTime;
}

export interface ClaimsDeskSummary {
  waitingForReview: number;
  oldestWaitingSince: IsoDateTime | null;
  inReview: number;
  awaitingPayment: number;
  decidedLast30Days: number;
  recentDecisions: RecentDecision[];
}

export interface SalesSummary {
  customers: number;
  policiesByStatus: StatusCount<PolicyStatus>[];
  premiumWritten: number;
  premiumLast30Days: number;
  policiesSoldLast30Days: number;
  openClaims: number;
  recentPolicies: PolicyResponse[];
}

// GET /api/staff/overview: a block per desk the caller works, else null.
export interface StaffOverviewResponse {
  generatedAt: IsoDateTime;
  currency: string;
  claims: ClaimsDeskSummary | null;
  sales: SalesSummary | null;
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

/* ---- Admin panel ---- */

export const STAFF_ROLES = ['Agent', 'Adjuster', 'Admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffStatusFilter = 'All' | 'Active' | 'Inactive';

export interface ListStaffQuery {
  search?: string;
  role?: StaffRole;
  status?: StaffStatusFilter;
  page?: number;
  pageSize?: number;
}

export interface StaffMemberResponse {
  id: Guid;
  email: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: IsoDateTime;
  deactivatedAt: IsoDateTime | null;
  // Customers assigned (agents) and claims held open (adjusters).
  customerCount: number;
  openClaimCount: number;
}

export interface ChangeRoleRequest {
  role: StaffRole;
}

export const AUDIT_ENTITY_TYPES = ['Claim', 'Policy', 'User', 'Customer', 'Error'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditLogQuery {
  actorId?: Guid;
  entityType?: AuditEntityType;
  from?: IsoDate;
  to?: IsoDate;
  // Actor name or email, claim or policy number, action text (max 100).
  search?: string;
  // Status/action codes whose translated label matched the search.
  actions?: readonly string[];
  page?: number;
  pageSize?: number;
}

// A recorded event: a claim or policy status change, or a staff action.
export interface AuditEventResponse {
  id: Guid;
  occurredAt: IsoDateTime;
  actorId: Guid | null;
  actorName: string | null;
  actorRole: UserRole | null;
  entityType: AuditEntityType;
  entityId: Guid;
  entityLabel: string;
  // 'StatusChanged' or an AuditAction name.
  action: string;
  fromValue: string | null;
  toValue: string | null;
}

export interface DashboardTotals {
  policiesIssued: number;
  premiumWritten: number;
  claimsFiled: number;
  claimsDecided: number;
  averageResolutionHours: number | null;
  claimsPaidAmount: number;
}

export interface DashboardMonth {
  year: number;
  month: number;
  policiesIssued: number;
  premiumWritten: number;
  claimsFiled: number;
}

export interface TopAgent {
  agentId: Guid;
  fullName: string;
  isActive: boolean;
  policiesSold: number;
  premiumWritten: number;
}

// GET /api/admin/dashboard
export interface AdminDashboardResponse {
  from: IsoDate;
  to: IsoDate;
  generatedAt: IsoDateTime;
  currency: string;
  totals: DashboardTotals;
  monthly: DashboardMonth[];
  claimsByStatus: StatusCount<ClaimStatus>[];
  topAgents: TopAgent[];
}

/* ---------- Error tracking (System section, Admin only) ---------- */

export const ERROR_SOURCES = ['Backend', 'Frontend'] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];
export const ERROR_STATUSES = ['New', 'Resolved', 'Ignored'] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];
export const ERROR_SORTS = ['LastSeen', 'Count', 'FirstSeen'] as const;
export type ErrorSort = (typeof ERROR_SORTS)[number];

export interface ErrorListQuery {
  source?: ErrorSource;
  status?: ErrorStatus;
  regressed?: boolean;
  from?: IsoDate;
  to?: IsoDate;
  httpStatus?: number;
  endpoint?: string;
  role?: UserRole;
  // Title, type or endpoint text, or a Reference / trace id.
  search?: string;
  sort?: ErrorSort;
  page?: number;
  pageSize?: number;
}

export interface ErrorGroupRow {
  id: Guid;
  title: string;
  source: ErrorSource;
  exceptionType: string;
  endpoint: string;
  occurrenceCount: number;
  firstSeenAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  lastHttpStatus: number | null;
  status: ErrorStatus;
  isRegressed: boolean;
  rowVersion: Guid;
}

export interface ErrorOccurrenceResponse {
  id: Guid;
  occurredAt: IsoDateTime;
  traceId: string;
  referenceCode: string;
  httpStatus: number | null;
  httpMethod: string | null;
  routeTemplate: string | null;
  actorRole: UserRole | null;
  actorUserId: Guid | null;
  appVersion: string | null;
  environment: string | null;
  message: string;
  stackTrace: string | null;
  userAgentFamily: string | null;
  clientRoute: string | null;
}

export interface ErrorGroupDetail {
  id: Guid;
  fingerprint: string;
  title: string;
  source: ErrorSource;
  exceptionType: string;
  endpoint: string;
  occurrenceCount: number;
  storedOccurrenceCount: number;
  firstSeenAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  lastHttpStatus: number | null;
  status: ErrorStatus;
  isRegressed: boolean;
  regressedAt: IsoDateTime | null;
  resolvedByName: string | null;
  resolvedAt: IsoDateTime | null;
  note: string | null;
  rowVersion: Guid;
  occurrences: ErrorOccurrenceResponse[];
}

export interface UpdateErrorStatusRequest {
  status: ErrorStatus;
  note?: string;
  rowVersion: Guid;
}

export interface ErrorLookupResponse {
  occurrence: ErrorOccurrenceResponse;
  group: ErrorGroupRow;
  matches: number;
}

export interface PurgeResolvedResponse {
  deleted: number;
  olderThanDays: number;
}

export interface ErrorCountBucket {
  start: IsoDateTime;
  count: number;
  serverErrors: number;
}

export interface ErrorSummaryResponse {
  generatedAt: IsoDateTime;
  lastDay: ErrorCountBucket[];
  lastWeek: ErrorCountBucket[];
  top: ErrorGroupRow[];
  unresolved: number;
  regressed: number;
}

export interface DatabaseHealth {
  reachable: boolean;
  roundTripMs: number | null;
  lastAppliedMigration: string | null;
  pendingMigrations: string[];
}

export interface SystemHealthResponse {
  version: string;
  build: string;
  environment: string;
  startedAt: IsoDateTime;
  uptimeSeconds: number;
  serverTimeUtc: IsoDateTime;
  // Asia/Baku wall time, "yyyy-MM-ddTHH:mm:ss".
  serverTimeBaku: string;
  database: DatabaseHealth;
  queueDepth: number;
  queueDropped: number;
  errorsLast24Hours: number;
  serverErrorsLast24Hours: number;
  rateLimitRejectionsLast24Hours: number;
  auditLogSize: number;
}
