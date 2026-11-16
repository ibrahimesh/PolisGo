using PolisGo.Application.Common.Exceptions;

namespace PolisGo.Application.Pricing;

public class PremiumCalculator : IPremiumCalculator
{
    public PremiumBreakdown Calculate(PremiumCalculationInput input)
    {
        Validate(input);

        var age = YearsBetween(input.DriverBirthDate, input.AsOfDate);
        var experience = YearsBetween(input.DrivingLicenseDate, input.AsOfDate);
        var vehicleAge = input.AsOfDate.Year - input.VehicleYear;

        var engineFactor = Tariff.EngineFactor(input.EngineCapacityCc);
        var driverAgeFactor = Tariff.DriverAgeFactor(age);
        var experienceFactor = Tariff.ExperienceFactor(experience);
        var vehicleAgeFactor = Tariff.VehicleAgeFactor(vehicleAge);
        var bonusMalusFactor = Tariff.BonusMalusFactor(input.ClaimsInLast3Years);
        var termFactor = Tariff.TermFactor(input.TermMonths);

        var riskProduct = engineFactor
            * driverAgeFactor
            * experienceFactor
            * vehicleAgeFactor
            * bonusMalusFactor;

        var cappedRisk = Tariff.ApplyRiskCap(riskProduct);
        var totalFactor = cappedRisk * termFactor;

        // Round once, at the end — intermediate values stay full-precision decimal
        // so repeated multiplications don't accumulate rounding error.
        var premium = Math.Round(
            input.BaseRate * totalFactor,
            2,
            MidpointRounding.AwayFromZero);

        return new PremiumBreakdown(
            BaseRate: input.BaseRate,
            EngineFactor: engineFactor,
            DriverAgeFactor: driverAgeFactor,
            ExperienceFactor: experienceFactor,
            VehicleAgeFactor: vehicleAgeFactor,
            BonusMalusFactor: bonusMalusFactor,
            TermFactor: termFactor,
            TotalFactor: totalFactor,
            Premium: premium,
            Currency: Tariff.Currency);
    }

    private static void Validate(PremiumCalculationInput input)
    {
        var errors = new Dictionary<string, string[]>();

        if (input.BaseRate <= 0)
            errors[nameof(input.BaseRate)] = new[] { "Base rate must be greater than zero." };

        if (input.EngineCapacityCc <= 0)
            errors[nameof(input.EngineCapacityCc)] = new[] { "Engine capacity must be greater than zero." };

        // Future-year vehicles are nonsense; vehicles older than 1950 fall outside
        // the model-year brackets this tariff was designed for.
        if (input.VehicleYear > input.AsOfDate.Year)
            errors[nameof(input.VehicleYear)] = new[] { "Vehicle year must not be in the future." };
        else if (input.VehicleYear < 1950)
            errors[nameof(input.VehicleYear)] = new[] { "Vehicle year must be 1950 or later." };

        if (input.TermMonths is < 1 or > 12)
            errors[nameof(input.TermMonths)] = new[] { "Term must be between 1 and 12 months." };

        if (input.ClaimsInLast3Years < 0)
            errors[nameof(input.ClaimsInLast3Years)] = new[] { "Claims count cannot be negative." };

        var age = YearsBetween(input.DriverBirthDate, input.AsOfDate);
        if (age < 18)
            errors[nameof(input.DriverBirthDate)] = new[] { "Driver must be at least 18 years old." };

        if (input.DrivingLicenseDate > input.AsOfDate)
            errors[nameof(input.DrivingLicenseDate)] = new[] { "Driving licence date must not be in the future." };
        else
        {
            var eighteenthBirthday = input.DriverBirthDate.AddYears(18);
            if (input.DrivingLicenseDate < eighteenthBirthday)
            {
                errors[nameof(input.DrivingLicenseDate)] = new[]
                {
                    "Driving licence date must be after the driver turns 18."
                };
            }
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    // Inclusive calendar-year difference: subtract one year when the anniversary
    // has not yet landed in the current year.
    private static int YearsBetween(DateOnly from, DateOnly to)
    {
        var years = to.Year - from.Year;
        if (to < from.AddYears(years))
        {
            years--;
        }
        return years;
    }
}
