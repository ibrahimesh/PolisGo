using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies.Dtos;

public record PolicyResponse(
    Guid Id,
    string PolicyNumber,
    Guid CustomerId,
    Guid VehicleId,
    Guid PolicyTypeId,
    string PolicyTypeCode,
    Guid? AgentId,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal Premium,
    string Currency,
    PolicyStatus Status,
    DateTime CreatedAt
);
