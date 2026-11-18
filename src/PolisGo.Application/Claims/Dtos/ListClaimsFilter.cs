using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims.Dtos;

public enum ClaimSortBy
{
    CreatedAt,
    IncidentDate,
    ClaimedAmount,
    ClaimNumber
}

public record ListClaimsFilter(
    ClaimStatus? Status = null,
    bool? AssignedToMe = null,
    DateTime? From = null,
    DateTime? To = null,
    int Page = 1,
    int PageSize = 20,
    // Submitted or UnderReview; ignored when Status is set.
    bool? Open = null,
    // Part of a claim or policy number, any case.
    string? Search = null,
    ClaimSortBy SortBy = ClaimSortBy.CreatedAt,
    SortDirection SortDir = SortDirection.Desc
);
