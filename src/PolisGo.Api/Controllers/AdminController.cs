using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Statistics;
using PolisGo.Application.Statistics.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminStatsService _stats;

    public AdminController(IAdminStatsService stats)
    {
        _stats = stats;
    }

    /// <summary>
    /// Portfolio-wide dashboard figures: policies and claims by status, premium
    /// written, claims paid, monthly activity (last 12 months, UTC) and average
    /// claim resolution time.
    /// </summary>
    /// <remarks>
    /// Computed with database aggregates and cached server-side for 60 seconds;
    /// <c>generatedAt</c> shows when the snapshot was taken. The response is
    /// marked <c>Cache-Control: private, max-age=60</c> to match.
    /// </remarks>
    /// <response code="200">The current statistics snapshot.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("stats")]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Client)]
    [ProducesResponseType<AdminStatsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<AdminStatsResponse>> Stats(CancellationToken cancellationToken)
    {
        return Ok(await _stats.GetAsync(cancellationToken));
    }
}
