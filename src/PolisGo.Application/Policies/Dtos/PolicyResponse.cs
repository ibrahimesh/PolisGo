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
    // Effective status: an Active policy past its end date reads as Expired.
    PolicyStatus Status,
    DateTime CreatedAt,
    PolicyVehicleSummary Vehicle
);

// Enough to recognise the car in a list without a second request.
public record PolicyVehicleSummary(
    Guid Id,
    string Make,
    string Model,
    int Year,
    string PlateNumber
);
