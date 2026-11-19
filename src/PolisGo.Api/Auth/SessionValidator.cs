using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using PolisGo.Application.Abstractions;
using PolisGo.Infrastructure.Auth;

namespace PolisGo.Api.Auth;

// A signature only proves the token was issued, not that the account may
// still use it. On each request the user must exist, be active and carry the
// same SecurityStamp as the token: deactivating a user or changing their role
// rotates the stamp, so their open sessions end at the next request.
public static class SessionValidator
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        var principal = context.Principal;
        var subject = principal?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var stamp = principal?.FindFirstValue(JwtTokenGenerator.SecurityStampClaimType);

        if (!Guid.TryParse(subject, out var userId) || !Guid.TryParse(stamp, out var tokenStamp))
        {
            context.Fail("The token has no session stamp.");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        var current = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.IsActive, u.SecurityStamp })
            .FirstOrDefaultAsync(context.HttpContext.RequestAborted);

        if (current is null || !current.IsActive || current.SecurityStamp != tokenStamp)
        {
            context.Fail("The session is no longer valid.");
        }
    }
}
