using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Cabinet;
using PolisGo.Application.Cabinet.Dtos;
using PolisGo.Application.Profile;
using PolisGo.Application.Profile.Dtos;

namespace PolisGo.Api.Controllers;

// The caller's own account and cabinet. Every action resolves the user from the token,
// never from the URL or body, so there is nothing to tamper with.
[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IProfileService _profile;
    private readonly ICabinetService _cabinet;

    public MeController(IProfileService profile, ICabinetService cabinet)
    {
        _profile = profile;
        _cabinet = cabinet;
    }

    /// <summary>
    /// The client cabinet's overview: policy counts, next renewal, insured
    /// vehicles, premiums paid in the last 12 months and recent activity.
    /// </summary>
    /// <remarks>
    /// Statuses are effective (an Active policy past its end date counts as
    /// Expired). Activity merges policy and claim status changes, newest first.
    /// </remarks>
    /// <response code="200">The overview.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not a Client.</response>
    [HttpGet("overview")]
    [Authorize(Roles = "Client")]
    [ProducesResponseType<ClientOverviewResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ClientOverviewResponse>> Overview(CancellationToken cancellationToken)
    {
        return Ok(await _cabinet.GetOverviewAsync(cancellationToken));
    }

    /// <summary>
    /// Renewal reminders: Active policies ending within 30 days that have no
    /// follow-on policy yet, soonest first.
    /// </summary>
    /// <remarks>
    /// Computed from end dates on every request; only the read marks are
    /// stored. A renewal (an Active policy, or a payable Draft, of the same
    /// type for the same vehicle starting after this one ends) clears it.
    /// </remarks>
    /// <response code="200">The reminders (at most 50).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not a Client.</response>
    [HttpGet("reminders")]
    [Authorize(Roles = "Client")]
    [ProducesResponseType<IReadOnlyList<ReminderResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<IReadOnlyList<ReminderResponse>>> Reminders(CancellationToken cancellationToken)
    {
        return Ok(await _cabinet.GetRemindersAsync(cancellationToken));
    }

    /// <summary>
    /// Marks the reminder for one policy as read. Idempotent.
    /// </summary>
    /// <response code="204">Marked (or already marked).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not a Client.</response>
    /// <response code="404">No such policy, or one the caller can't see.</response>
    [HttpPost("reminders/{policyId:guid}/read")]
    [Authorize(Roles = "Client")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkReminderRead(Guid policyId, CancellationToken cancellationToken)
    {
        await _cabinet.MarkReminderReadAsync(policyId, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Marks every current reminder as read. Idempotent.
    /// </summary>
    /// <response code="204">Marked.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not a Client.</response>
    [HttpPost("reminders/read-all")]
    [Authorize(Roles = "Client")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkAllRemindersRead(CancellationToken cancellationToken)
    {
        await _cabinet.MarkAllRemindersReadAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// The signed-in user's profile.
    /// </summary>
    /// <remarks>
    /// Phone, birth date and licence date come from the linked customer
    /// record and are null for staff accounts.
    /// </remarks>
    /// <response code="200">The profile.</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpGet]
    [ProducesResponseType<ProfileResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<ProfileResponse>> Get(CancellationToken cancellationToken)
    {
        return Ok(await _profile.GetAsync(cancellationToken));
    }

    /// <summary>
    /// Updates the signed-in user's name and phone.
    /// </summary>
    /// <remarks>
    /// Same rules as registration. The phone is required for Clients, accepted
    /// in any common format and stored as E.164 (+994XXXXXXXXX); staff
    /// accounts must leave it empty.
    /// </remarks>
    /// <response code="200">The updated profile.</response>
    /// <response code="400">One or more fields are invalid (errors keyed by field).</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpPut]
    [ProducesResponseType<ProfileResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<ProfileResponse>> Update(
        [FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _profile.UpdateAsync(request, cancellationToken));
    }

    /// <summary>
    /// Changes the signed-in user's password.
    /// </summary>
    /// <remarks>
    /// A wrong current password is a 400 on <c>currentPassword</c>, not a 401:
    /// the caller is signed in, and a 401 would end their session. Tokens
    /// issued before the change stay valid until they expire (60 minutes).
    /// </remarks>
    /// <response code="204">Password changed.</response>
    /// <response code="400">Current password wrong, or the new one breaks the policy or repeats the old one.</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        await _profile.ChangePasswordAsync(request, cancellationToken);
        return NoContent();
    }
}
