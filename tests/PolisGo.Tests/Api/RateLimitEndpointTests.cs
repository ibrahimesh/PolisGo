using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using PolisGo.Application.Auth;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// Brute force: sign-in and registration are limited per IP, password
// changes per account. Over the limit is a 429 ProblemDetails with
// Retry-After and a message the SPA translates.
public class RateLimitEndpointTests : IClassFixture<RateLimitEndpointTests.StrictLimits>
{
    public sealed class StrictLimits : ApiFactory
    {
        public const int Permits = 3;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            foreach (var policy in new[] { "SignIn", "Register", "PasswordChange" })
            {
                builder.UseSetting($"RateLimits:{policy}:PermitLimit", Permits.ToString());
                builder.UseSetting($"RateLimits:{policy}:WindowSeconds", "60");
            }
        }
    }

    private readonly StrictLimits _factory;
    public RateLimitEndpointTests(StrictLimits factory) => _factory = factory;

    private static async Task AssertTooManyRequests(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.RetryAfter?.Delta > TimeSpan.Zero, "Retry-After is missing");
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(429, problem.GetProperty("status").GetInt32());
        Assert.Equal(AuthValidation.Messages.TooManyAttempts, problem.GetProperty("detail").GetString());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Sign_in_attempts_over_the_limit_are_429()
    {
        var client = _factory.CreateClient();
        var wrong = new { email = $"nobody-{Guid.NewGuid():N}@polisgo.test", password = "Wrong-Passw0rd" };

        for (var i = 0; i < StrictLimits.Permits; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", wrong)).StatusCode);
        }

        await AssertTooManyRequests(await client.PostAsJsonAsync("/api/auth/login", wrong));
    }

    [Fact]
    public async Task Registrations_over_the_limit_are_429()
    {
        var client = _factory.CreateClient();
        HttpResponseMessage? last = null;
        for (var i = 0; i <= StrictLimits.Permits; i++)
        {
            last = await client.PostAsJsonAsync("/api/auth/register", new { email = "not-an-email" });
        }

        await AssertTooManyRequests(last!);
    }

    [Fact]
    public async Task Password_changes_over_the_limit_are_429_for_that_account_only()
    {
        var limited = _factory.ClientAs(UserRole.Client);
        var other = _factory.ClientAs(UserRole.Client);
        var attempt = new { currentPassword = "Wrong-Passw0rd", newPassword = "New-Passw0rd1" };

        for (var i = 0; i < StrictLimits.Permits; i++)
        {
            Assert.Equal(HttpStatusCode.BadRequest,
                (await limited.PostAsJsonAsync("/api/me/change-password", attempt)).StatusCode);
        }

        await AssertTooManyRequests(await limited.PostAsJsonAsync("/api/me/change-password", attempt));
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync("/api/me/change-password", attempt)).StatusCode);
    }
}
