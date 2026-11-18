using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Vehicles.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Customers.Dtos;

public enum CustomerSortBy
{
    CreatedAt,
    FullName,
    Email
}

public record ListCustomersQuery(
    // Matched against name, email and phone (phone ignores spaces/dashes).
    string? Search = null,
    CustomerSortBy SortBy = CustomerSortBy.CreatedAt,
    SortDirection SortDirection = SortDirection.Desc,
    int Page = 1,
    int PageSize = 20
);

// Policy and claim counts follow the caller's usual visibility: an Agent
// counts only policies they sold, an Adjuster only claims open to them.
public record CustomerListItem(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    DateTime CreatedAt,
    bool HasAccount,
    int VehicleCount,
    int PolicyCount,
    int ActivePolicyCount,
    int ClaimCount
);

public record CustomerDetailResponse(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    DateOnly BirthDate,
    DateOnly DrivingLicenseDate,
    DateTime CreatedAt,
    bool HasAccount,
    // The agent who looks after the customer; null when nobody does.
    Guid? AgentId,
    string? AgentName,
    IReadOnlyList<VehicleResponse> Vehicles,
    // Newest first; same visibility rules as GET /api/policies.
    IReadOnlyList<PolicyResponse> Policies,
    CustomerClaimsSummary Claims
);

// Admin only: hand a customer to an agent, or null to release them.
public record AssignAgentRequest(Guid? AgentId);

public record CustomerClaimsSummary(
    int Total,
    IReadOnlyList<StatusCount<ClaimStatus>> ByStatus,
    decimal ClaimedAmount,
    decimal PaidAmount,
    // The most recent claims (up to RecentClaimsLimit); same visibility as GET /api/claims.
    IReadOnlyList<ClaimResponse> Recent
);
