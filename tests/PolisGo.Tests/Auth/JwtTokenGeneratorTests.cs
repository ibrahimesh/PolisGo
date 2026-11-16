using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using Xunit;

namespace PolisGo.Tests.Auth;

public class JwtTokenGeneratorTests
{
    private static JwtTokenGenerator NewSut(int expiryMinutes = 60)
    {
        var settings = Options.Create(new JwtSettings
        {
            Issuer = "test-issuer",
            Audience = "test-audience",
            SecretKey = "this-is-a-very-long-test-secret-key-32chars",
            ExpiryMinutes = expiryMinutes
        });
        return new JwtTokenGenerator(settings);
    }

    private static User BuildUser(UserRole role = UserRole.Client) => new()
    {
        Id = Guid.NewGuid(),
        Email = "jwt@example.com",
        PasswordHash = "n/a",
        FullName = "JWT User",
        Role = role,
        CreatedAt = DateTime.UtcNow
    };

    [Fact]
    public void GenerateToken_IncludesRoleClaim()
    {
        var sut = NewSut();
        var user = BuildUser(UserRole.Agent);

        var (token, _) = sut.GenerateToken(user);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        var role = jwt.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role");
        Assert.NotNull(role);
        Assert.Equal("Agent", role!.Value);
    }

    [Fact]
    public void GenerateToken_IncludesSubAndEmailAndJti()
    {
        var sut = NewSut();
        var user = BuildUser();

        var (token, _) = sut.GenerateToken(user);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(user.Id.ToString(),
            jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(user.Email,
            jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.False(string.IsNullOrWhiteSpace(
            jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Jti).Value));
    }

    [Fact]
    public void GenerateToken_ExpiresAtReflectsConfiguredExpiryMinutes()
    {
        var sut = NewSut(expiryMinutes: 15);

        var before = DateTime.UtcNow;
        var (_, expiresAt) = sut.GenerateToken(BuildUser());
        var after = DateTime.UtcNow;

        // Allow a small window around now + 15 minutes to account for test-run jitter.
        Assert.InRange(expiresAt, before.AddMinutes(15).AddSeconds(-5), after.AddMinutes(15).AddSeconds(5));
    }
}
