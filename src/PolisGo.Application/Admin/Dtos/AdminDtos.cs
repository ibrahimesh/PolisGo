using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Admin.Dtos;

/* ---------- Staff ---------- */

public enum StaffStatusFilter
{
    All,
    Active,
    Inactive
}

public record ListStaffQuery(
    // Name or email, any case.
    string? Search = null,
    UserRole? Role = null,
    StaffStatusFilter Status = StaffStatusFilter.All,
    int Page = 1,
    int PageSize = 20
);

public record StaffMemberResponse(
    Guid Id,
    string Email,
    string FullName,
    UserRole Role,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? DeactivatedAt,
    // Customers assigned to them (agents) and claims they hold open (adjusters).
    int CustomerCount,
    int OpenClaimCount
);

public record ChangeRoleRequest(UserRole? Role);

/* ---------- Audit log ---------- */

// What a feed row is about.
public enum AuditEntityType
{
    Claim,
    Policy,
    User,
    Customer
}

public record AuditLogQuery(
    Guid? ActorId = null,
    AuditEntityType? EntityType = null,
    // Inclusive calendar days in Baku (BusinessCalendar).
    DateOnly? From = null,
    DateOnly? To = null,
    int Page = 1,
    int PageSize = 20
);

// One recorded event. Claim and policy rows come from their status history,
// staff actions from the audit table; nothing is synthesised.
public record AuditEventResponse(
    Guid Id,
    DateTime OccurredAt,
    // Null for policy history rows that predate recording who acted.
    Guid? ActorId,
    string? ActorName,
    UserRole? ActorRole,
    AuditEntityType EntityType,
    Guid EntityId,
    // Claim or policy number, staff email, customer name.
    string EntityLabel,
    // "StatusChanged" for claims and policies, else an AuditAction name.
    string Action,
    string? FromValue,
    string? ToValue
);

/* ---------- Dashboard ---------- */

public record AdminDashboardResponse(
    DateOnly From,
    DateOnly To,
    DateTime GeneratedAt,
    string Currency,
    DashboardTotals Totals,
    // One row per calendar month in the range, oldest first.
    IReadOnlyList<DashboardMonth> Monthly,
    // Claims filed in the range, by their current status.
    IReadOnlyList<StatusCount<ClaimStatus>> ClaimsByStatus,
    // By premium collected in the range, highest first.
    IReadOnlyList<TopAgent> TopAgents
);

public record DashboardTotals(
    int PoliciesIssued,
    decimal PremiumWritten,
    int ClaimsFiled,
    int ClaimsDecided,
    // Mean hours from filing to the decision, for claims decided in the range.
    double? AverageResolutionHours,
    decimal ClaimsPaidAmount
);

public record DashboardMonth(int Year, int Month, int PoliciesIssued, decimal PremiumWritten, int ClaimsFiled);

public record TopAgent(Guid AgentId, string FullName, bool IsActive, int PoliciesSold, decimal PremiumWritten);
