using PolisGo.Application.Common;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Staff.Dtos;

// One block per desk the caller works: claims for Adjusters and Admins,
// sales for Agents and Admins. A block the role doesn't have is null.
public record StaffOverviewResponse(
    DateTime GeneratedAt,
    string Currency,
    ClaimsDeskSummary? Claims,
    SalesSummary? Sales
);

// Counts are over the claims the caller can see (ClaimAccess): for an
// Adjuster the open queue and their own, for an Admin all of them.
public record ClaimsDeskSummary(
    int WaitingForReview,
    // Oldest Submitted claim still waiting; null when the queue is empty.
    DateTime? OldestWaitingSince,
    int InReview,
    int AwaitingPayment,
    int DecidedLast30Days,
    // Newest first.
    IReadOnlyList<RecentDecision> RecentDecisions
);

public record RecentDecision(
    Guid ClaimId,
    string ClaimNumber,
    string CustomerName,
    ClaimStatus Status,
    decimal ClaimedAmount,
    decimal? ApprovedAmount,
    string DecidedBy,
    DateTime DecidedAt
);

// Over the policies the caller can see (PolicyAccess): an Agent's own sales,
// everything for an Admin. Statuses are effective (Expired derived).
public record SalesSummary(
    int Customers,
    IReadOnlyList<StatusCount<PolicyStatus>> PoliciesByStatus,
    // Completed payments.
    decimal PremiumWritten,
    decimal PremiumLast30Days,
    int PoliciesSoldLast30Days,
    // Submitted or UnderReview claims on these policies.
    int OpenClaims,
    // Newest first.
    IReadOnlyList<PolicyResponse> RecentPolicies
);
