using System.Text.RegularExpressions;

namespace PolisGo.Application.Diagnostics;

// Applied to every message and stack before an error is stored or shown:
// error text is where secrets leak (a SQL error quoting its connection
// string, a URL with a token in its query, a validation message echoing an
// email). Patterns run most specific first, so a JWT inside a bearer header
// or a password inside a connection string is caught by the wider rule.
// Request bodies and headers are never read in the first place.
public static partial class Redaction
{
    public const int MessageMaxLength = 1000;
    public const int StackMaxLength = 8000;

    public static string Message(string? text) => Truncate(Scrub(text), MessageMaxLength);

    public static string? Stack(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : Truncate(ShortenPaths(Scrub(text)), StackMaxLength);

    public static string Scrub(string? text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        var s = ConnectionString().Replace(text, "[connection string]");
        s = Bearer().Replace(s, "Bearer [token]");
        s = Jwt().Replace(s, "[jwt]");
        s = SecretPair().Replace(s, m => $"{m.Groups["key"].Value}{m.Groups["sep"].Value}[redacted]");
        s = Url().Replace(s, m => m.Groups["scheme"].Value + m.Groups["host"].Value + m.Groups["path"].Value);
        s = RelativeQuery().Replace(s, "$1");
        s = Email().Replace(s, "[email]");
        s = IPv4().Replace(s, "[ip]");
        s = IPv6().Replace(s, "[ip]");
        s = LongNumber().Replace(s, "[number]");
        return s;
    }

    // "/src/src/PolisGo.Api/Controllers/X.cs:line 42" and
    // "C:\Users\name\repo\X.cs" become "X.cs:line 42": the file is useful,
    // the machine's layout (and a user name in it) isn't.
    public static string ShortenPaths(string text) => LocalPath().Replace(text, "${file}");

    public static string Truncate(string text, int max)
    {
        var trimmed = text.Trim();
        return trimmed.Length <= max ? trimmed : string.Concat(trimmed.AsSpan(0, max - 1), "…");
    }

    // Two or more key=value pairs with a server or data source: SqlClient
    // and SQLite messages quote these.
    [GeneratedRegex(@"(?i)\b(?:server|data source|host|address|addr)\s*=\s*[^;'""\r\n]+;(?:\s*[a-z][a-z ]*\s*=\s*[^;'""\r\n]*;?)+")]
    private static partial Regex ConnectionString();

    [GeneratedRegex(@"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]+=*")]
    private static partial Regex Bearer();

    [GeneratedRegex(@"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?")]
    private static partial Regex Jwt();

    [GeneratedRegex(@"(?i)(?<key>\b(?:password|passwd|pwd|secret|client_secret|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|authorization|signature|sig|session|cookie|set-cookie)\b""?)(?<sep>\s*[:=]\s*)(?:""[^""]*""|'[^']*'|[^\s;,&""']+)")]
    private static partial Regex SecretPair();

    // Scheme, host and path kept; user:password@, query and fragment dropped.
    [GeneratedRegex(@"(?i)(?<scheme>\b[a-z][a-z0-9+.-]*://)(?:[^/\s@]+@)?(?<host>[^\s/?#""'<>]+)(?<path>[^\s?#""'<>]*)(?:\?[^\s#""'<>]*)?(?:#[^\s""'<>]*)?")]
    private static partial Regex Url();

    // "/api/x?token=…" without a scheme.
    [GeneratedRegex(@"(/[\w\-./~%]*)\?[^\s""'<>]+")]
    private static partial Regex RelativeQuery();

    [GeneratedRegex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")]
    private static partial Regex Email();

    [GeneratedRegex(@"\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b")]
    private static partial Regex IPv4();

    // Three or more colons (a time of day has two), or a "::" compression.
    [GeneratedRegex(@"(?i)(?<![\w:])(?:(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?=\W|$))(?![\w:])")]
    private static partial Regex IPv6();

    // Nine or more digits, spaces or dashes allowed between them: card,
    // account, phone and id numbers. Not inside a GUID or a word.
    [GeneratedRegex(@"(?<![\w\-])\+?\d(?:[ \-]?\d){8,}(?![\w\-])")]
    private static partial Regex LongNumber();

    [GeneratedRegex(@"(?:[A-Za-z]:)?(?:[\\/][^\\/\s:""'()]+)+[\\/](?<file>[^\\/\s:""'()]+\.(?:cs|tsx?|jsx?|mjs|cjs))")]
    private static partial Regex LocalPath();
}
