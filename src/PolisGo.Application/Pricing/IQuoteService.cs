using PolisGo.Application.Pricing.Dtos;

namespace PolisGo.Application.Pricing;

public interface IQuoteService
{
    Task<PremiumBreakdown> CalculateAsync(
        CalculateQuoteRequest request,
        DateOnly asOfDate,
        CancellationToken cancellationToken = default);
}
