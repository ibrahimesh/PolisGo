using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Statistics;
using PolisGo.Application.Statistics.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminStatsService _stats;
    private readonly IAdminDashboardService _dashboard;
    private readonly IAuditLogService _audit;

    public AdminController(IAdminStatsService stats, IAdminDashboardService dashboard, IAuditLogService audit)
    {
        _stats = stats;
        _dashboard = dashboard;
        _audit = audit;
    }

    /// <summary>
    /// Dashboard figures for a date range: policies, premium and claims by
    /// month, claims by status, resolution time and the top agents.
    /// </summary>
    /// <param name="from">First day (Baku date), inclusive. Default: the first day of the month eleven months ago.</param>
    /// <param name="to">Last day (Baku date), inclusive. Default: today.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <remarks>Database aggregates, cached server-side for 60 seconds per range. At most 24 months.</remarks>
    /// <response code="200">The figures.</response>
    /// <response code="400">from after to, or a range longer than 24 months.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("dashboard")]
    [ProducesResponseType<AdminDashboardResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<AdminDashboardResponse>> Dashboard(
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        return Ok(await _dashboard.GetAsync(from, to, cancellationToken));
    }

    /// <summary>
    /// The audit log: claim and policy status changes and staff actions,
    /// newest first.
    /// </summary>
    /// <param name="actorId">Only what this user did.</param>
    /// <param name="entityType">Claim, Policy, User (staff accounts) or Customer (assignments).</param>
    /// <param name="from">First day (Baku date), inclusive.</param>
    /// <param name="to">Last day (Baku date), inclusive.</param>
    /// <param name="page">1-based page number, at most 200.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <remarks>
    /// Only recorded events: status history rows and the staff actions logged
    /// since this feature shipped (creation, deactivation, reactivation, role
    /// changes, customer assignment). Earlier staff actions were not recorded.
    /// </remarks>
    /// <response code="200">A page of events.</response>
    /// <response code="400">Invalid filter, or from after to.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("audit")]
    [ProducesResponseType<PagedResult<AuditEventResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResult<AuditEventResponse>>> Audit(
        [FromQuery] Guid? actorId,
        [FromQuery] AuditEntityType? entityType,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _audit.ListAsync(
            new AuditLogQuery(actorId, entityType, from, to, page, pageSize), cancellationToken));
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
