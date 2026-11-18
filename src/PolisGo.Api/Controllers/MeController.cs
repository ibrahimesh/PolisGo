using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Profile;
using PolisGo.Application.Profile.Dtos;

namespace PolisGo.Api.Controllers;

// The caller's own account. Every action resolves the user from the token,
// never from the URL or body, so there is nothing to tamper with.
[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IProfileService _profile;

    public MeController(IProfileService profile)
    {
        _profile = profile;
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
