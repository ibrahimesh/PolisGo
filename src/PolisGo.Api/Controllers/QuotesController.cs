using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Pricing;
using PolisGo.Application.Pricing.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/quotes")]
public class QuotesController : ControllerBase
{
    private readonly IQuoteService _quoteService;

    public QuotesController(IQuoteService quoteService)
    {
        _quoteService = quoteService;
    }

    /// <summary>
    /// Calculates an indicative premium quote from the provided risk data.
    /// </summary>
    /// <remarks>
    /// This is an ESTIMATE only. When a policy is actually issued on Day 4,
    /// the premium will be recalculated server-side from stored customer,
    /// vehicle and claims data — the price returned here is never trusted
    /// as the authoritative value for the issued policy.
    /// </remarks>
    [HttpPost("calculate")]
    [AllowAnonymous]
    public async Task<ActionResult<PremiumBreakdown>> Calculate(
        [FromBody] CalculateQuoteRequest request, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var breakdown = await _quoteService.CalculateAsync(request, today, cancellationToken);
        return Ok(breakdown);
    }
}
