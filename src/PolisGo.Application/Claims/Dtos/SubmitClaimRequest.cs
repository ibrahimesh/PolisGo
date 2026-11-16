namespace PolisGo.Application.Claims.Dtos;

public record SubmitClaimRequest(
    Guid PolicyId,
    DateTime IncidentDate,
    string Description,
    decimal ClaimedAmount,
    // Agent/Admin supplies; Client's CustomerId comes from the token.
    Guid? CustomerId
);
