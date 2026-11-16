using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Pricing;
using Xunit;

namespace PolisGo.Tests.Pricing;

public class PremiumCalculatorTests
{
    // Fixed reference date so tests are deterministic — no DateTime.Now anywhere.
    private static readonly DateOnly AsOf = new(2026, 6, 15);

    // Baseline with every risk factor at 1.00 so each test can swap in just the
    // field it's exercising. Risk product = 1.00 → Premium = BaseRate.
    private static PremiumCalculationInput Baseline() => new(
        PolicyTypeCode: "MTPL",
        BaseRate: 100.00m,
        EngineCapacityCc: 1500,                // 1.00
        DriverBirthDate: new DateOnly(1990, 6, 15),   // age 36 -> 1.00
        DrivingLicenseDate: new DateOnly(2018, 6, 15),// exp 8  -> 1.00
        VehicleYear: 2020,                     // age 6 -> 1.00
        ClaimsInLast3Years: 1,                 // -> 1.00
        TermMonths: 12,                        // -> 1.00
        AsOfDate: AsOf);

    private static PremiumCalculator Sut() => new();

    // ---------- Golden case ----------

    // Golden case hand-computed:
    //   Engine 2200       -> 1.35
    //   Age 31            -> 1.00
    //   Experience 12 yrs -> 0.95
    //   Vehicle age 6     -> 1.00
    //   Claims 1          -> 1.00
    //   Risk product      = 1.35 * 1.00 * 0.95 * 1.00 * 1.00 = 1.2825 (uncapped)
    //   Term 12           -> 1.00
    //   TotalFactor       = 1.2825
    //   Premium           = 200.00 * 1.2825 = 256.50
    [Fact]
    public void Calculate_GoldenCase_MatchesHandComputedPremium()
    {
        var input = Baseline() with
        {
            BaseRate = 200.00m,
            EngineCapacityCc = 2200,
            DriverBirthDate = new DateOnly(1995, 6, 15),
            DrivingLicenseDate = new DateOnly(2014, 6, 15),
            VehicleYear = 2020,
            ClaimsInLast3Years = 1,
            TermMonths = 12
        };

        var breakdown = Sut().Calculate(input);

        Assert.Equal(1.35m, breakdown.EngineFactor);
        Assert.Equal(1.00m, breakdown.DriverAgeFactor);
        Assert.Equal(0.95m, breakdown.ExperienceFactor);
        Assert.Equal(1.00m, breakdown.VehicleAgeFactor);
        Assert.Equal(1.00m, breakdown.BonusMalusFactor);
        Assert.Equal(1.00m, breakdown.TermFactor);
        Assert.Equal(1.2825m, breakdown.TotalFactor);
        Assert.Equal(256.50m, breakdown.Premium);
        Assert.Equal("AZN", breakdown.Currency);
    }

    // ---------- Rounding (AwayFromZero) ----------

    // Pre-rounded premium is exactly 130.625 (a midpoint). AwayFromZero must
    // round to 130.63 — Banker's rounding would give 130.62 (nearest even).
    [Fact]
    public void Calculate_MidpointPremium_RoundsAwayFromZero()
    {
        var input = Baseline() with
        {
            BaseRate = 100.00m,
            EngineCapacityCc = 1500,         // 1.00
            DriverBirthDate = new DateOnly(1990, 6, 15),
            DrivingLicenseDate = new DateOnly(2010, 6, 15), // exp 16 -> 0.95
            VehicleYear = 2014,              // age 12 -> 1.10
            ClaimsInLast3Years = 2,          // 1.25
            TermMonths = 12
        };

        var breakdown = Sut().Calculate(input);

        Assert.Equal(1.30625m, breakdown.TotalFactor);
        Assert.Equal(130.63m, breakdown.Premium);
    }

    // ---------- Term handling ----------

    [Fact]
    public void Calculate_TwelveMonthTerm_NoShortTermLoading()
    {
        var input = Baseline() with { TermMonths = 12 };
        var breakdown = Sut().Calculate(input);
        Assert.Equal(1.00m, breakdown.TermFactor);
        Assert.Equal(100.00m, breakdown.Premium);
    }

    [Fact]
    public void Calculate_SixMonthTerm_AppliesShortTermLoading()
    {
        var input = Baseline() with { TermMonths = 6 };
        var breakdown = Sut().Calculate(input);
        // 0.50 * 1.10 = 0.55
        Assert.Equal(0.55m, breakdown.TermFactor);
        Assert.Equal(55.00m, breakdown.Premium);
    }

    [Fact]
    public void Calculate_OneMonthTerm_AppliesShortTermLoading()
    {
        var input = Baseline() with { TermMonths = 1 };
        var breakdown = Sut().Calculate(input);
        // (1/12) * 1.10 at full decimal precision, then premium rounded to 2dp.
        var expectedTerm = (1m / 12m) * 1.10m;
        Assert.Equal(expectedTerm, breakdown.TermFactor);
        Assert.Equal(
            Math.Round(100.00m * expectedTerm, 2, MidpointRounding.AwayFromZero),
            breakdown.Premium);
    }

    // ---------- Safety cap (upper via calculator; lower via Tariff) ----------

    [Fact]
    public void Calculate_RiskProductAboveCeiling_ClampsAtThreeTimesBaseRate()
    {
        // Engine 3500 (1.60) * Age 65 (1.20) * Exp 1yr (1.30) * Vehicle 2010 (1.10)
        //   * Claims 5 (1.50) = 4.1184 -> capped to 3.00.
        var input = Baseline() with
        {
            BaseRate = 100.00m,
            EngineCapacityCc = 3500,
            DriverBirthDate = new DateOnly(1961, 6, 15), // age 65
            DrivingLicenseDate = new DateOnly(2025, 6, 15), // exp 1
            VehicleYear = 2010,                          // age 16
            ClaimsInLast3Years = 5,
            TermMonths = 12
        };

        var breakdown = Sut().Calculate(input);

        Assert.Equal(3.00m, breakdown.TotalFactor);
        Assert.Equal(300.00m, breakdown.Premium);
    }

    // ---------- Monotonicity ----------

    [Fact]
    public void Monotonic_HigherEngineCc_IsNeverCheaper()
    {
        var sut = Sut();
        var ccs = new[] { 1500, 1700, 2500, 3500 };
        var premiums = ccs.Select(cc => sut.Calculate(Baseline() with { EngineCapacityCc = cc }).Premium).ToArray();

        for (var i = 1; i < premiums.Length; i++)
        {
            Assert.True(premiums[i] >= premiums[i - 1],
                $"Expected premium non-decreasing with cc; got {premiums[i]} < {premiums[i - 1]} at cc={ccs[i]}");
        }
    }

    [Fact]
    public void Monotonic_YoungerDriverInYouthBand_IsNeverCheaper()
    {
        // Within the youthful-driver effect (young vs middle-aged), younger is
        // priced at or above middle-aged.
        var sut = Sut();

        // Age 24 (1.40) vs age 30 (1.00). License set to birth+18 so experience
        // is directly implied by age and comparable.
        var young = Baseline() with
        {
            DriverBirthDate = new DateOnly(2002, 6, 15),
            DrivingLicenseDate = new DateOnly(2020, 6, 15) // exp 6 -> 1.00
        };
        var middle = Baseline() with
        {
            DriverBirthDate = new DateOnly(1996, 6, 15),
            DrivingLicenseDate = new DateOnly(2020, 6, 15) // exp 6 -> 1.00
        };

        Assert.True(sut.Calculate(young).Premium >= sut.Calculate(middle).Premium);
    }

    [Fact]
    public void Monotonic_LessExperience_IsNeverCheaper()
    {
        var sut = Sut();
        var licenses = new[]
        {
            new DateOnly(2016, 6, 15), // exp 10 -> 0.95
            new DateOnly(2020, 6, 15), // exp 6  -> 1.00
            new DateOnly(2022, 6, 15), // exp 4  -> 1.10
            new DateOnly(2025, 6, 15)  // exp 1  -> 1.30
        };
        var premiums = licenses
            .Select(l => sut.Calculate(Baseline() with { DrivingLicenseDate = l }).Premium)
            .ToArray();

        // Order is from most-experienced to least-experienced — premium should
        // be non-decreasing along that axis.
        for (var i = 1; i < premiums.Length; i++)
        {
            Assert.True(premiums[i] >= premiums[i - 1]);
        }
    }

    [Fact]
    public void Monotonic_MoreClaims_IsNeverCheaper()
    {
        var sut = Sut();
        var claims = new[] { 0, 1, 2, 3, 5 };
        var premiums = claims
            .Select(c => sut.Calculate(Baseline() with { ClaimsInLast3Years = c }).Premium)
            .ToArray();

        for (var i = 1; i < premiums.Length; i++)
        {
            Assert.True(premiums[i] >= premiums[i - 1]);
        }
    }

    // ---------- Breakdown consistency ----------

    [Fact]
    public void BreakdownConsistency_UncappedCase_TotalFactorIsProductOfFactors()
    {
        var input = Baseline() with
        {
            EngineCapacityCc = 2200,                       // 1.35
            DriverBirthDate = new DateOnly(1995, 6, 15),   // 1.00
            DrivingLicenseDate = new DateOnly(2014, 6, 15),// 0.95
            VehicleYear = 2020,                            // 1.00
            ClaimsInLast3Years = 1,                        // 1.00
            TermMonths = 6                                  // 0.55
        };

        var b = Sut().Calculate(input);
        var expectedTotal = b.EngineFactor
            * b.DriverAgeFactor
            * b.ExperienceFactor
            * b.VehicleAgeFactor
            * b.BonusMalusFactor
            * b.TermFactor;

        Assert.Equal(expectedTotal, b.TotalFactor);
        Assert.Equal(
            Math.Round(b.BaseRate * b.TotalFactor, 2, MidpointRounding.AwayFromZero),
            b.Premium);
    }

    // ---------- Invalid inputs ----------

    public static IEnumerable<object[]> InvalidInputs()
    {
        var baseline = new PremiumCalculationInput(
            "MTPL", 100m, 1500,
            new DateOnly(1990, 6, 15), new DateOnly(2018, 6, 15),
            2020, 1, 12, new DateOnly(2026, 6, 15));

        // Driver under 18
        yield return new object[]
        {
            baseline with { DriverBirthDate = new DateOnly(2015, 6, 15), DrivingLicenseDate = new DateOnly(2025, 6, 15) },
            nameof(baseline.DriverBirthDate)
        };
        // License before the 18th birthday
        yield return new object[]
        {
            baseline with { DriverBirthDate = new DateOnly(1995, 6, 15), DrivingLicenseDate = new DateOnly(2010, 6, 15) },
            nameof(baseline.DrivingLicenseDate)
        };
        // License in the future
        yield return new object[]
        {
            baseline with { DrivingLicenseDate = new DateOnly(2030, 6, 15) },
            nameof(baseline.DrivingLicenseDate)
        };
        // Engine cc <= 0
        yield return new object[]
        {
            baseline with { EngineCapacityCc = 0 },
            nameof(baseline.EngineCapacityCc)
        };
        // Vehicle year in future
        yield return new object[]
        {
            baseline with { VehicleYear = 2050 },
            nameof(baseline.VehicleYear)
        };
        // Vehicle year too old
        yield return new object[]
        {
            baseline with { VehicleYear = 1949 },
            nameof(baseline.VehicleYear)
        };
        // Term too small
        yield return new object[]
        {
            baseline with { TermMonths = 0 },
            nameof(baseline.TermMonths)
        };
        // Term too large
        yield return new object[]
        {
            baseline with { TermMonths = 13 },
            nameof(baseline.TermMonths)
        };
        // Negative claims
        yield return new object[]
        {
            baseline with { ClaimsInLast3Years = -1 },
            nameof(baseline.ClaimsInLast3Years)
        };
        // Base rate <= 0
        yield return new object[]
        {
            baseline with { BaseRate = 0m },
            nameof(baseline.BaseRate)
        };
    }

    [Theory]
    [MemberData(nameof(InvalidInputs))]
    public void Calculate_InvalidInput_ThrowsValidationException(
        PremiumCalculationInput input, string expectedField)
    {
        var ex = Assert.Throws<ValidationException>(() => Sut().Calculate(input));
        Assert.Contains(expectedField, ex.Errors.Keys);
    }
}
