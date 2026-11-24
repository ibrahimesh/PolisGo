using System.Reflection;
using PolisGo.Application.Abstractions;

namespace PolisGo.Api.Diagnostics;

// The running build: the API assembly's informational version ("1.0.0+<sha>"
// when the SDK knows the commit) and the host environment's name.
public sealed class AppInfo : IAppInfo
{
    public AppInfo(IHostEnvironment environment, TimeProvider clock)
    {
        var informational = typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
        var plus = informational.IndexOf('+');
        Version = plus < 0 ? informational : informational[..plus];
        var build = plus < 0 ? "" : informational[(plus + 1)..];
        Build = build.Length == 0 ? "local" : build[..Math.Min(12, build.Length)];
        Environment = environment.EnvironmentName;
        StartedAtUtc = clock.GetUtcNow().UtcDateTime;
    }

    public string Version { get; }
    public string Build { get; }
    public string Environment { get; }
    public DateTime StartedAtUtc { get; }
}
