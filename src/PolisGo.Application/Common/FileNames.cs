using System.Text;

namespace PolisGo.Application.Common;

// Cross-platform leaf-name sanitizer for client-supplied file names. Path.GetFileName
// only recognises '\' as a separator on Windows, which leaves a traversal segment
// intact on Linux (our Docker image). We normalise both separators ourselves.
public static class FileNames
{
    public const int MaxLength = 255;
    public const string Fallback = "file";

    // Chars illegal in Windows file names plus NUL (illegal on Linux too). Keeping
    // the intersection strict means names are safe on both OSes without a second pass.
    private static readonly char[] InvalidChars =
        { '<', '>', ':', '"', '|', '?', '*', '\0', '/', '\\' };

    public static string Sanitize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return Fallback;
        }

        // Treat both separators the same so traversal segments are stripped on Linux too.
        var normalized = input.Replace('\\', '/');

        var lastSlash = normalized.LastIndexOf('/');
        var leaf = lastSlash >= 0 ? normalized[(lastSlash + 1)..] : normalized;

        var buffer = new StringBuilder(leaf.Length);
        foreach (var ch in leaf)
        {
            if (char.IsControl(ch)) continue;
            if (Array.IndexOf(InvalidChars, ch) >= 0) continue;
            buffer.Append(ch);
        }

        // Windows FS strips trailing dots/spaces silently; normalise here so the
        // same bytes land in the DB regardless of the server OS.
        var cleaned = buffer.ToString().Trim().TrimEnd(' ', '\t', '.');

        if (cleaned.Length == 0)
        {
            return Fallback;
        }

        if (cleaned.Length > MaxLength)
        {
            // Preserve the extension when a plausible one is present so routing by
            // file type still works after truncation.
            var dot = cleaned.LastIndexOf('.');
            if (dot > 0 && cleaned.Length - dot <= 16)
            {
                var ext = cleaned[dot..];
                var stemBudget = Math.Max(1, MaxLength - ext.Length);
                cleaned = cleaned[..Math.Min(stemBudget, dot)] + ext;
            }
            else
            {
                cleaned = cleaned[..MaxLength];
            }
        }

        return cleaned;
    }
}
