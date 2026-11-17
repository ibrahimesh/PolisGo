using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Statistics.Dtos;

// Dashboard snapshot for administrators. GeneratedAt tells clients how fresh
// the (briefly cached) numbers are. Money is in Currency (AZN).
public record AdminStatsResponse(
    DateTime GeneratedAt,
    string Currency,
    int TotalCustomers,
    PolicyStats Policies,
    ClaimStats Claims,
    IReadOnlyList<MonthlyActivity> Monthly
);

public record PolicyStats(
    int Total,
    // Every PolicyStatus is listed, zero-filled, in enum order.
    IReadOnlyList<StatusCount<PolicyStatus>> ByStatus,
    // Sum of completed premium payments — money actually bound, not drafts.
    decimal PremiumWritten
);

public record ClaimStats(
    int Total,
    // Every ClaimStatus is listed, zero-filled, in enum order.
    IReadOnlyList<StatusCount<ClaimStatus>> ByStatus,
    // Sum of ApprovedAmount over claims that reached Paid.
    decimal PaidAmount,
    // Claims with a decision (first transition to Approved or Rejected).
    int ResolvedCount,
    // Mean time from submission to that decision; null until one exists.
    double? AverageResolutionHours
);

// One row per calendar month (UTC), oldest first, current month last.
public record MonthlyActivity(int Year, int Month, int NewPolicies, int NewClaims);
