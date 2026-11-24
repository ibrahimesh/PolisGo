using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Diagnostics;

// What makes two errors "the same bug": source, exception type, where in our
// code it surfaced (the top application frames, by method name: no line
// numbers, paths or bundle hashes, which change with every build) and the
// endpoint template. A client error has no stable frames (a production
// bundle renames functions per build), so its message template stands in.
public static partial class ErrorFingerprint
{
    public const int FrameCount = 3;
    private const string ApplicationNamespace = "PolisGo.";

    public static string Compute(ErrorSource source, string exceptionType, IEnumerable<string> signature, string endpoint)
    {
        var text = string.Join('\n', new[] { source.ToString(), exceptionType }
            .Concat(signature.Take(FrameCount))
            .Append(endpoint));
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    }

    // The application frames an exception passed through, innermost first,
    // as "Namespace.Type.Method"; compiler-made async and lambda types map
    // back to the method a person wrote.
    public static IReadOnlyList<string> ApplicationFrames(Exception exception, int max = FrameCount)
    {
        var frames = new List<string>(max);
        foreach (var frame in new StackTrace(exception, fNeedFileInfo: false).GetFrames())
        {
            var name = Describe(frame.GetMethod());
            if (name is null || !name.StartsWith(ApplicationNamespace, StringComparison.Ordinal)) continue;
            if (frames.Count > 0 && frames[^1] == name) continue;
            frames.Add(name);
            if (frames.Count == max) break;
        }
        return frames;
    }

    // "Could not load claim 3f2a… for 42 AZN" and "… 9c1b… for 17 AZN" are
    // one message: ids, numbers, hex and quoted values become placeholders.
    public static string MessageTemplate(string message)
    {
        var text = Guids().Replace(message, "{id}");
        text = Quoted().Replace(text, "{text}");
        text = Hex().Replace(text, "{hex}");
        text = Numbers().Replace(text, "{n}");
        text = Spaces().Replace(text, " ").Trim();
        return text.Length > 200 ? text[..200] : text;
    }

    private static string? Describe(MethodBase? method)
    {
        var type = method?.DeclaringType;
        if (method is null || type is null) return null;
        var name = method.Name;
        // "<SaveAsync>d__4.MoveNext" or "<>c__DisplayClass3_0.<Run>b__0": the
        // generated type sits inside the real one, its name holds the method.
        while (type.DeclaringType is not null && type.Name.StartsWith('<'))
        {
            var inner = GeneratedName().Match(type.Name);
            if (inner.Success && inner.Groups[1].Value.Length > 0) name = inner.Groups[1].Value;
            type = type.DeclaringType;
        }
        var lambda = GeneratedName().Match(name);
        if (lambda.Success && lambda.Groups[1].Value.Length > 0) name = lambda.Groups[1].Value;
        return $"{type.FullName}.{name}";
    }

    [GeneratedRegex(@"^<([^>]*)>")]
    private static partial Regex GeneratedName();

    [GeneratedRegex(@"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")]
    private static partial Regex Guids();

    [GeneratedRegex("\"[^\"]*\"|'[^']*'|«[^»]*»|“[^”]*”")]
    private static partial Regex Quoted();

    [GeneratedRegex(@"\b(?=[0-9a-fA-F]*\d)[0-9a-fA-F]{8,}\b")]
    private static partial Regex Hex();

    [GeneratedRegex(@"\d+(?:[.,]\d+)*")]
    private static partial Regex Numbers();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}
