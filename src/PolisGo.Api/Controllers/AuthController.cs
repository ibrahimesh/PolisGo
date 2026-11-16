using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Common.Exceptions;
using AppUnauthorizedException = PolisGo.Application.Common.Exceptions.UnauthorizedException;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Register(
        [FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var response = await _authService.RegisterAsync(request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var response = await _authService.LoginAsync(request, cancellationToken);
        return Ok(response);
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<CurrentUserResponse>> Me(CancellationToken cancellationToken)
    {
        // "sub" claim is the canonical subject id — ClaimTypes.NameIdentifier
        // is the MS mapping of that same claim after JwtBearer's default mapping.
        var idString = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (!Guid.TryParse(idString, out var id))
        {
            throw new AppUnauthorizedException("Token is missing a valid subject.");
        }

        var response = await _authService.GetCurrentUserAsync(id, cancellationToken);
        return Ok(response);
    }
}
