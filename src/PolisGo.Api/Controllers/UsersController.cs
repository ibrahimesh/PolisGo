using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Controllers;

// Staff accounts (Agent, Adjuster, Admin). Every change is audited. An admin
// can't deactivate or change the role of their own account, and the last
// active admin can't be deactivated or demoted.
[ApiController]
[Route("api/users")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly IStaffAdminService _staff;

    public UsersController(IStaffAdminService staff)
    {
        _staff = staff;
    }

    /// <summary>Paged staff accounts, by name.</summary>
    /// <param name="search">Part of a name or email, any case. Max 100 characters.</param>
    /// <param name="role">Agent, Adjuster or Admin.</param>
    /// <param name="status">All (default), Active or Inactive.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">A page of staff accounts.</response>
    /// <response code="400">Invalid role, status or search.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("staff")]
    [ProducesResponseType<PagedResult<StaffMemberResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResult<StaffMemberResponse>>> List(
        [FromQuery] string? search,
        [FromQuery] UserRole? role,
        [FromQuery] StaffStatusFilter status = StaffStatusFilter.All,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _staff.ListAsync(new ListStaffQuery(search, role, status, page, pageSize), cancellationToken));
    }

    /// <summary>Creates a staff account (Agent, Adjuster or Admin).</summary>
    /// <remarks>Email, password and name follow the registration rules.</remarks>
    /// <response code="201">The new account.</response>
    /// <response code="400">One or more fields are invalid (errors keyed by field).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="409">A user with this email already exists.</response>
    [HttpPost("staff")]
    [ProducesResponseType<StaffMemberResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<StaffMemberResponse>> CreateStaff(
        [FromBody] CreateStaffUserRequest request, CancellationToken cancellationToken)
    {
        var response = await _staff.CreateAsync(request, cancellationToken);
        return Created($"/api/users/staff?search={Uri.EscapeDataString(response.Email)}", response);
    }

    /// <summary>Deactivates a staff account: no sign-in, and its open sessions end.</summary>
    /// <response code="200">The account, now inactive.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No staff account with this id.</response>
    /// <response code="409">Your own account, the last active admin, or already inactive.</response>
    [HttpPost("{id:guid}/deactivate")]
    [ProducesResponseType<StaffMemberResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<StaffMemberResponse>> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _staff.DeactivateAsync(id, cancellationToken));
    }

    /// <summary>Reactivates a staff account; it signs in again with its password.</summary>
    /// <response code="200">The account, now active.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No staff account with this id.</response>
    /// <response code="409">The account is already active.</response>
    [HttpPost("{id:guid}/reactivate")]
    [ProducesResponseType<StaffMemberResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<StaffMemberResponse>> Reactivate(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _staff.ReactivateAsync(id, cancellationToken));
    }

    /// <summary>Changes a staff account's role; its open sessions end.</summary>
    /// <remarks>
    /// A former agent's customers go back to unassigned (each release is
    /// recorded). Claims a former adjuster holds stay assigned; an admin can
    /// decide them.
    /// </remarks>
    /// <response code="200">The account with its new role.</response>
    /// <response code="400">Role is not Agent, Adjuster or Admin.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No staff account with this id.</response>
    /// <response code="409">Your own account, the last active admin, or the same role.</response>
    [HttpPut("{id:guid}/role")]
    [ProducesResponseType<StaffMemberResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<StaffMemberResponse>> ChangeRole(
        Guid id, [FromBody] ChangeRoleRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _staff.ChangeRoleAsync(id, request, cancellationToken));
    }
}
