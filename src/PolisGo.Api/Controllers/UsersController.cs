using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IAuthService _authService;

    public UsersController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("staff")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<CurrentUserResponse>> CreateStaff(
        [FromBody] CreateStaffUserRequest request, CancellationToken cancellationToken)
    {
        var response = await _authService.CreateStaffUserAsync(request, cancellationToken);
        // Returned at /api/auth/me after the created user logs in — no dedicated
        // staff-by-id endpoint yet, so Location header points to the collection.
        return Created("/api/users", response);
    }
}
