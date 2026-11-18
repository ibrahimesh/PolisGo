using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Staff;
using PolisGo.Application.Staff.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/staff")]
[Authorize(Roles = "Agent,Adjuster,Admin")]
public class StaffController : ControllerBase
{
    private readonly IStaffOverviewService _overview;

    public StaffController(IStaffOverviewService overview)
    {
        _overview = overview;
    }

    /// <summary>
    /// The staff home page: claims desk figures for Adjusters and Admins,
    /// sales figures for Agents and Admins.
    /// </summary>
    /// <remarks>
    /// Each figure uses the same visibility as the list it summarises
    /// (GET /api/claims, /api/policies, /api/customers); a block the caller's
    /// role doesn't work is null. Windows are the last 30 days, UTC.
    /// </remarks>
    /// <response code="200">The figures.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is a Client.</response>
    [HttpGet("overview")]
    [ProducesResponseType<StaffOverviewResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<StaffOverviewResponse>> Overview(CancellationToken cancellationToken)
    {
        return Ok(await _overview.GetAsync(cancellationToken));
    }
}
