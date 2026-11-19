using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies.Dtos;

public enum PolicySortBy
{
    CreatedAt,
    StartDate,
    EndDate,
    Premium,
    PolicyNumber
}

public record ListPoliciesQuery(
    // Effective status, so "Expired" includes Active policies past their end date.
    PolicyStatus? Status = null,
    string? PolicyTypeCode = null,
    // Matches the policy number, the vehicle's plate or the holder's name,
    // case-insensitively.
    string? Search = null,
    PolicySortBy SortBy = PolicySortBy.CreatedAt,
    SortDirection SortDir = SortDirection.Desc,
    int Page = 1,
    int PageSize = 20,
    // Policies sold by this agent (within the caller's scope).
    Guid? AgentId = null
);
