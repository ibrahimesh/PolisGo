using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Diagnostics;
using PolisGo.Application.Diagnostics.Dtos;

namespace PolisGo.Api.Controllers;

/// <summary>
/// The System section's health view.
/// </summary>
[ApiController]
[Route("api/admin/system")]
[Authorize(Roles = "Admin")]
[Produces("application/json")]
public class SystemController : ControllerBase
{
    private readonly ISystemHealthService _health;

    public SystemController(ISystemHealthService health) => _health = health;

    /// <summary>
    /// Version and build, environment, uptime, server time (UTC and Baku),
    /// database reachability with a round-trip time, migration state, the
    /// error writer's queue, error and 5xx counts and rate-limit rejections in
    /// the last 24 hours, and the audit log's size.
    /// </summary>
    /// <remarks>Read live. No configuration values, connection strings or secrets.</remarks>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">The health snapshot (also when the database is unreachable).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("health")]
    [ProducesResponseType<SystemHealthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<SystemHealthResponse>> Health(CancellationToken cancellationToken) =>
        Ok(await _health.GetAsync(cancellationToken));
}
