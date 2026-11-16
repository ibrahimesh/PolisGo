namespace PolisGo.Application.Pricing;

public interface IPremiumCalculator
{
    PremiumBreakdown Calculate(PremiumCalculationInput input);
}
