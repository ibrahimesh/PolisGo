using System.Text.RegularExpressions;

namespace PolisGo.Application.Diagnostics;

// The "Reference 8F05E497" users see: the first 8 characters of the W3C
// trace id, upper-cased. The SPA's shortReference computes the same thing
// from the traceId in a ProblemDetails; the stored ReferenceCode is this.
public static partial class ErrorReference
{
    public const int Length = 8;

    // The 32-hex trace id inside a traceparent ("00-<32>-<16>-01"), or a
    // bare 32-hex id; lower case. Null for anything else.
    public static string? TraceIdOf(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var match = TraceParent().Match(value.Trim());
        if (match.Success) return match.Groups[1].Value.ToLowerInvariant();
        var bare = value.Trim();
        return bare.Length == 32 && IsHex(bare) ? bare.ToLowerInvariant() : null;
    }

    public static string CodeOf(string traceId) => traceId[..Length].ToUpperInvariant();

    // A new id in the server's format, for an error that has none.
    public static string NewTraceId() => Guid.NewGuid().ToString("N");

    // What an admin pasted: "8F05E497", "8f05-e497", "8F05 E497", a full
    // trace id or traceparent. Returns the code and, when given, the id.
    public static (string? Code, string? TraceId) Parse(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return (null, null);
        if (TraceIdOf(input) is { } full) return (CodeOf(full), full);
        var compact = Separators().Replace(input, "");
        if (TraceIdOf(compact) is { } joined) return (CodeOf(joined), joined);
        return compact.Length == Length && IsHex(compact) ? (compact.ToUpperInvariant(), null) : (null, null);
    }

    private static bool IsHex(string text) => text.All(Uri.IsHexDigit);

    [GeneratedRegex(@"^[0-9a-fA-F]{2}-([0-9a-fA-F]{32})-[0-9a-fA-F]{16}-[0-9a-fA-F]{2}$")]
    private static partial Regex TraceParent();

    [GeneratedRegex(@"[\s\-_:]")]
    private static partial Regex Separators();
}

// A browser family for the occurrence ("Chrome", "Firefox"), never the
// user agent string, which narrows a person down further than needed.
public static class UserAgentFamily
{
    public static string? Of(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent)) return null;
        var ua = userAgent;
        var family =
            ua.Contains("Edg/", StringComparison.Ordinal) ? "Edge"
            : ua.Contains("OPR/", StringComparison.Ordinal) ? "Opera"
            : ua.Contains("Firefox/", StringComparison.Ordinal) ? "Firefox"
            : ua.Contains("Chrome/", StringComparison.Ordinal) || ua.Contains("CriOS/", StringComparison.Ordinal) ? "Chrome"
            : ua.Contains("Safari/", StringComparison.Ordinal) ? "Safari"
            : ua.StartsWith("curl/", StringComparison.OrdinalIgnoreCase) ? "curl"
            : "Other";
        return ua.Contains("Mobile", StringComparison.Ordinal) && family is not ("curl" or "Other") ? $"{family} (mobile)" : family;
    }
}
