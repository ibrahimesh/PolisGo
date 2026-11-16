namespace PolisGo.Application.Policies.Dtos;

public record CreatePolicyRequest(
    Guid VehicleId,
    string PolicyTypeCode,
    DateOnly StartDate,
    int TermMonths,
    // Agent/Admin must supply; Client uses their own CustomerId from the token.
    Guid? CustomerId
);
