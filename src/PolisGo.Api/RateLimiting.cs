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
    // Anonymous client error reports: per address (over it, 429), and a
    // budget for all addresses together (over it, reports are dropped and
    // counted, still answered 202), so no one can flood the error tables.
    public WindowLimit ClientErrors { get; set; } = new() { PermitLimit = 20, WindowSeconds = 60 };
    public WindowLimit ClientErrorsGlobal { get; set; } = new() { PermitLimit = 300, WindowSeconds = 60 };
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
    public const string ClientErrors = "client-errors";

    public static IServiceCollection AddPolisGoRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var limits = configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>() ?? new RateLimitOptions();
        services.AddSingleton(new ClientErrorBudget(limits.ClientErrorsGlobal));
        return services.AddRateLimiter(options =>
        {
            options.AddPolicy(SignIn, context => Window(ByAddress(context), limits.SignIn));
            options.AddPolicy(Register, context => Window(ByAddress(context), limits.Register));
            options.AddPolicy(PasswordChange, context => Window(ByAccount(context), limits.PasswordChange));
            options.AddPolicy(ClientErrors, context => Window(ByAddress(context), limits.ClientErrors));
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

// All addresses' client error reports together, per window. A token that
// isn't granted means the report is dropped (and counted), not refused: the
// browser learns nothing from it.
public sealed class ClientErrorBudget(WindowLimit limit) : IDisposable
{
    private readonly FixedWindowRateLimiter _limiter = new(new FixedWindowRateLimiterOptions
    {
        PermitLimit = Math.Max(1, limit.PermitLimit),
        Window = TimeSpan.FromSeconds(Math.Max(1, limit.WindowSeconds)),
        QueueLimit = 0
    });

    public bool TryTake()
    {
        using var lease = _limiter.AttemptAcquire();
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
