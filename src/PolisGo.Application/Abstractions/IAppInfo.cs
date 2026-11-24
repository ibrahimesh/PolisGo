namespace PolisGo.Application.Abstractions;

// What build is running where, for error occurrences and the health page.
// Never configuration values or secrets.
public interface IAppInfo
{
    string Version { get; }
    string Build { get; }
    string Environment { get; }
    DateTime StartedAtUtc { get; }
}
