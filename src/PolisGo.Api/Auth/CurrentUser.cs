using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using PolisGo.Application.Abstractions;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;

namespace PolisGo.Api.Auth;

// Resolves the current user's identity from the authenticated HttpContext.
// Scoped lifetime — one instance per request, with claims read once in the ctor.
public class CurrentUser : ICurrentUser
{
    public CurrentUser(IHttpContextAccessor accessor)
    {
        var principal = accessor.HttpContext?.User
            ?? throw new InvalidOperationException("CurrentUser resolved outside of an HTTP request.");

        // JwtBearer maps "sub" to ClaimTypes.NameIdentifier by default.
        var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? throw new InvalidOperationException("Token is missing subject claim.");
        UserId = Guid.Parse(idValue);

        var roleValue = principal.FindFirstValue(ClaimTypes.Role)
            ?? throw new InvalidOperationException("Token is missing role claim.");
        Role = Enum.Parse<UserRole>(roleValue);

        var customerIdValue = principal.FindFirstValue(JwtTokenGenerator.CustomerIdClaimType);
        CustomerId = Guid.TryParse(customerIdValue, out var customerId) ? customerId : null;
    }

    public Guid UserId { get; }
    public UserRole Role { get; }
    public Guid? CustomerId { get; }
}
