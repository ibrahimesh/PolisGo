using PolisGo.Application.Pricing;
using Xunit;

namespace PolisGo.Tests.Pricing;

// Boundary-value tests pinned to the tariff's own functions. Keeping these
// separate from the calculator integration tests makes it obvious which layer
// fails when a coefficient is retuned.
public class TariffTests
{
    [Theory]
    [InlineData(1, 1.00)]
    [InlineData(1600, 1.00)]
    [InlineData(1601, 1.15)]
    [InlineData(2000, 1.15)]
    [InlineData(2001, 1.35)]
    [InlineData(3000, 1.35)]
    [InlineData(3001, 1.60)]
    [InlineData(6000, 1.60)]
    public void EngineFactor_MatchesBand(int cc, double expected)
    {
        Assert.Equal((decimal)expected, Tariff.EngineFactor(cc));
    }

    [Theory]
    [InlineData(18, 1.40)]
    [InlineData(24, 1.40)]
    [InlineData(25, 1.00)]
    [InlineData(40, 1.00)]
    [InlineData(64, 1.00)]
    [InlineData(65, 1.20)]
    [InlineData(90, 1.20)]
    public void DriverAgeFactor_MatchesBand(int age, double expected)
    {
        Assert.Equal((decimal)expected, Tariff.DriverAgeFactor(age));
    }

    [Theory]
    [InlineData(0, 1.30)]
    [InlineData(1, 1.30)]
    [InlineData(2, 1.10)]
    [InlineData(5, 1.10)]
    [InlineData(6, 1.00)]
    [InlineData(9, 1.00)]
    [InlineData(10, 0.95)]
    [InlineData(30, 0.95)]
    public void ExperienceFactor_MatchesBand(int years, double expected)
    {
        Assert.Equal((decimal)expected, Tariff.ExperienceFactor(years));
    }

    [Theory]
    [InlineData(0, 1.00)]
    [InlineData(10, 1.00)]
    [InlineData(11, 1.10)]
    [InlineData(30, 1.10)]
    public void VehicleAgeFactor_MatchesBand(int vehicleAge, double expected)
    {
        Assert.Equal((decimal)expected, Tariff.VehicleAgeFactor(vehicleAge));
    }

    [Theory]
    [InlineData(0, 0.90)]
    [InlineData(1, 1.00)]
    [InlineData(2, 1.25)]
    [InlineData(3, 1.50)]
    [InlineData(10, 1.50)]
    public void BonusMalusFactor_MatchesBand(int claims, double expected)
    {
        Assert.Equal((decimal)expected, Tariff.BonusMalusFactor(claims));
    }

    [Theory]
    [InlineData(12, 1.00)]
    [InlineData(6, 0.55)]  // 0.50 * 1.10 short-term loading
    [InlineData(3, 0.275)] // 0.25 * 1.10
    public void TermFactor_AppliesShortTermLoadingBelowTwelve(int months, decimal expected)
    {
        Assert.Equal(expected, Tariff.TermFactor(months));
    }

    [Fact]
    public void TermFactor_TwelveMonths_IsExactlyOne()
    {
        Assert.Equal(1.00m, Tariff.TermFactor(12));
    }

    [Fact]
    public void TermFactor_OneMonth_EqualsOneTwelfthTimesLoading()
    {
        // (1/12) * 1.10 at full decimal precision — literal can't round-trip
        // through [InlineData] without precision loss, so compute dynamically.
        var expected = (1m / 12m) * Tariff.ShortTermLoading;
        Assert.Equal(expected, Tariff.TermFactor(1));
    }

    [Theory]
    [InlineData(0.30, 0.50)]  // below the floor — clamped up
    [InlineData(0.49, 0.50)]
    [InlineData(0.50, 0.50)]  // boundary stays
    [InlineData(1.25, 1.25)]  // within bounds — returned unchanged
    [InlineData(3.00, 3.00)]  // boundary stays
    [InlineData(3.01, 3.00)]
    [InlineData(5.00, 3.00)]  // above the ceiling — clamped down
    public void ApplyRiskCap_ClampsToBothEnds(decimal input, decimal expected)
    {
        Assert.Equal(expected, Tariff.ApplyRiskCap(input));
    }
}
