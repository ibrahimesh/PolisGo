namespace PolisGo.Application.Pricing;

// All pricing coefficients live here so an actuary (or ops) can tune the model
// in exactly one place. Keeping them static today makes it trivial to move to
// configuration or a database table later without touching the calculator.
public static class Tariff
{
    public const string Currency = "AZN";

    // Cap applied to the product of the five risk factors — NOT to the term
    // factor. Prevents the formula from blowing up (or collapsing) when every
    // risk dimension lines up in the same direction.
    public const decimal MinRiskProduct = 0.50m;
    public const decimal MaxRiskProduct = 3.00m;

    // Short-term loading multiplier applied when the policy term is < 12 months.
    // Rationale: shorter terms carry disproportionate admin cost relative to
    // the pro-rated premium, so we add 10%.
    public const decimal ShortTermLoading = 1.10m;

    public static decimal EngineFactor(int engineCapacityCc) => engineCapacityCc switch
    {
        <= 1600 => 1.00m,
        <= 2000 => 1.15m,
        <= 3000 => 1.35m,
        _ => 1.60m
    };

    public static decimal DriverAgeFactor(int ageYears) => ageYears switch
    {
        < 18 => throw new ArgumentOutOfRangeException(nameof(ageYears),
            "Driver must be at least 18 years old."),
        <= 24 => 1.40m,
        <= 64 => 1.00m,
        _ => 1.20m
    };

    public static decimal ExperienceFactor(int experienceYears) => experienceYears switch
    {
        < 2 => 1.30m,
        <= 5 => 1.10m,
        <= 9 => 1.00m,
        _ => 0.95m
    };

    public static decimal VehicleAgeFactor(int vehicleAgeYears) =>
        vehicleAgeYears <= 10 ? 1.00m : 1.10m;

    public static decimal BonusMalusFactor(int claimsInLast3Years) => claimsInLast3Years switch
    {
        0 => 0.90m,
        1 => 1.00m,
        2 => 1.25m,
        _ => 1.50m
    };

    public static decimal TermFactor(int termMonths)
    {
        var fraction = (decimal)termMonths / 12m;
        return termMonths < 12 ? fraction * ShortTermLoading : fraction;
    }

    // Clamp exposed as its own method so unit tests can hit both boundaries
    // directly without crafting extreme coefficient combinations.
    public static decimal ApplyRiskCap(decimal riskProduct)
    {
        if (riskProduct < MinRiskProduct) return MinRiskProduct;
        if (riskProduct > MaxRiskProduct) return MaxRiskProduct;
        return riskProduct;
    }
}
