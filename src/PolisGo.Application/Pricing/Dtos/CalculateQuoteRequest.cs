namespace PolisGo.Application.Pricing.Dtos;

public record CalculateQuoteRequest(
    string PolicyTypeCode,
    int EngineCapacityCc,
    DateOnly DriverBirthDate,
    DateOnly DrivingLicenseDate,
    int VehicleYear,
    int ClaimsInLast3Years,
    int TermMonths
);
