using System.Security.Claims;
using System.Threading.RateLimiting;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;

namespace PolisGo.Api;

// Brute-force limits, fixed windows from the "RateLimits" section. The
// defaults below (also in appsettings.json) are for real use; the e2e stack
// (docker-compose.e2e.yml) and the test factory relax them, because there one
// address signs up hundreds of users.
public sealed class RateLimitOptions
{
    public const string SectionName = "RateLimits";

    // Per IP address: password guessing and account enumeration.
    public WindowLimit SignIn { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };
    public WindowLimit Register { get; set; } = new() { PermitLimit = 10, WindowSeconds = 3600 };
    // Per account: guessing the current password with a stolen session.
    public WindowLimit PasswordChange { get; set; } = new() { PermitLimit = 5, WindowSeconds = 900 };
}

public sealed class WindowLimit
{
    public int PermitLimit { get; set; }
    public int WindowSeconds { get; set; }
}

public static class RateLimits
{
    public const string SignIn = "sign-in";
    public const string Register = "register";
    public const string PasswordChange = "password-change";

    public static IServiceCollection AddPolisGoRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var limits = configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>() ?? new RateLimitOptions();
        return services.AddRateLimiter(options =>
        {
            options.AddPolicy(SignIn, context => Window(ByAddress(context), limits.SignIn));
            options.AddPolicy(Register, context => Window(ByAddress(context), limits.Register));
            options.AddPolicy(PasswordChange, context => Window(ByAccount(context), limits.PasswordChange));
            options.OnRejected = (context, _) =>
            {
                context.HttpContext.RequestServices.GetService<IRateLimitMonitor>()?.RecordRejection();
                throw new TooManyRequestsException(
                    context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? wait : null);
            };
        });
    }

    private static RateLimitPartition<string> Window(string key, WindowLimit limit) =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limit.PermitLimit,
            Window = TimeSpan.FromSeconds(limit.WindowSeconds),
            QueueLimit = 0
        });

    // Behind a reverse proxy this is the proxy's address until forwarded
    // headers are configured for it; the compose stack has no proxy.
    private static string ByAddress(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static string ByAccount(HttpContext context) =>
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ByAddress(context);
}
