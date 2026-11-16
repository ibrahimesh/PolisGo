namespace PolisGo.Application.Pricing;

// AsOfDate is part of the input so the calculator stays a pure function:
// no DateTime.Now, no ambient state — same inputs always yield the same breakdown.
public record PremiumCalculationInput(
    string PolicyTypeCode,
    decimal BaseRate,
    int EngineCapacityCc,
    DateOnly DriverBirthDate,
    DateOnly DrivingLicenseDate,
    int VehicleYear,
    int ClaimsInLast3Years,
    int TermMonths,
    DateOnly AsOfDate
);
