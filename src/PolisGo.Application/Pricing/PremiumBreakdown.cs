namespace PolisGo.Application.Pricing;

// All factor fields are the per-component multipliers before the safety cap.
// TotalFactor reflects the cap (if applied) multiplied by the term factor, so
// Premium == BaseRate * TotalFactor rounded. Returning both the individual
// factors and the composite makes the result auditable for customers and ops.
public record PremiumBreakdown(
    decimal BaseRate,
    decimal EngineFactor,
    decimal DriverAgeFactor,
    decimal ExperienceFactor,
    decimal VehicleAgeFactor,
    decimal BonusMalusFactor,
    decimal TermFactor,
    decimal TotalFactor,
    decimal Premium,
    string Currency
);
