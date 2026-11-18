using System.Globalization;
using System.Text;

namespace PolisGo.Application.Common;

// RFC 4180 CSV for the staff exports. Cells are escaped when they are made,
// by type: text is neutralised against spreadsheet formulas, numbers and
// dates are written in the invariant culture and never touched.
public static class Csv
{
    // Excel reads a BOM-less file in the system's ANSI code page, which turns
    // Cyrillic and Azerbaijani letters (ə, ğ, ş) into mojibake.
    private static readonly byte[] Utf8Bom = [0xEF, 0xBB, 0xBF];

    // A cell starting with one of these is run as a formula by Excel, Sheets
    // and LibreOffice ("=HYPERLINK(...)" in a customer name, CWE-1236).
    private static readonly char[] FormulaTriggers = ['=', '+', '-', '@', '\t', '\r'];

    public static string Text(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;

        // A leading apostrophe makes the spreadsheet show the value as text.
        var safe = Array.IndexOf(FormulaTriggers, value[0]) >= 0 ? "'" + value : value;
        return Quote(safe);
    }

    public static string Number(decimal? value) =>
        value?.ToString("0.00", CultureInfo.InvariantCulture) ?? string.Empty;

    public static string Date(DateOnly? value) =>
        value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty;

    public static string Timestamp(DateTime? value) =>
        value?.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) ?? string.Empty;

    // UTF-8 with a BOM and CRLF line ends, as RFC 4180 and Excel expect.
    public static byte[] Write(IReadOnlyList<string> header, IEnumerable<IReadOnlyList<string>> rows)
    {
        var builder = new StringBuilder();
        builder.Append(string.Join(',', header.Select(Text))).Append("\r\n");
        foreach (var row in rows)
        {
            builder.Append(string.Join(',', row)).Append("\r\n");
        }

        var body = Encoding.UTF8.GetBytes(builder.ToString());
        return [.. Utf8Bom, .. body];
    }

    private static string Quote(string value)
    {
        var needsQuotes = value.IndexOfAny([',', '"', '\r', '\n']) >= 0
            || value[0] == ' ' || value[^1] == ' ';
        return needsQuotes ? "\"" + value.Replace("\"", "\"\"") + "\"" : value;
    }
}
