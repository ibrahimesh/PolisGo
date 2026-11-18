using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims.Dtos;

public record SubmitClaimRequest(
    Guid PolicyId,
    DateTime IncidentDate,
    string Description,
    decimal ClaimedAmount,
    // Agent/Admin supplies; Client's CustomerId comes from the token.
    Guid? CustomerId,
    // Required; nullable so a missing value is a 400 on the field, not a
    // silent default to the first enum member.
    IncidentType? IncidentType = null,
    string? Location = null
);
