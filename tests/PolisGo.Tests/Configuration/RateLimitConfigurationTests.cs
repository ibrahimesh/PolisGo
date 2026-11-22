using Microsoft.Extensions.Configuration;
using PolisGo.Api;

namespace PolisGo.Tests.Configuration;

// The shipped appsettings.json carries the strict brute-force limits (the
// e2e stack and the test factory relax them on purpose).
public class RateLimitConfigurationTests
{
    [Fact]
    public void Appsettings_ships_the_strict_limits()
    {
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(RepoFiles.Root, "src", "PolisGo.Api", "appsettings.json"))
            .Build();
        var section = configuration.GetSection(RateLimitOptions.SectionName);
        Assert.True(section.Exists(), "appsettings.json has no RateLimits section");

        var shipped = section.Get<RateLimitOptions>()!;
        var defaults = new RateLimitOptions();
        foreach (var (name, limit, fallback) in new[]
                 {
                     ("SignIn", shipped.SignIn, defaults.SignIn),
                     ("Register", shipped.Register, defaults.Register),
                     ("PasswordChange", shipped.PasswordChange, defaults.PasswordChange)
                 })
        {
            Assert.True(limit.PermitLimit == fallback.PermitLimit && limit.WindowSeconds == fallback.WindowSeconds,
                $"{name}: {limit.PermitLimit}/{limit.WindowSeconds}s in appsettings, {fallback.PermitLimit}/{fallback.WindowSeconds}s in code");
            Assert.InRange(limit.PermitLimit, 1, 20);
        }
    }
}
