using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims.Dtos;

public record ListClaimsFilter(
    ClaimStatus? Status,
    bool? AssignedToMe,
    DateTime? From,
    DateTime? To,
    int Page,
    int PageSize
);
