using System.Text;

namespace PolisGo.Application.Common;

// Case-insensitive search that behaves the same on SQLite and SQL Server.
// Neither database folds case reliably for this product's languages: SQLite's
// upper()/lower() touch ASCII only (Cyrillic and ə stay as typed), and SQL
// Server's UPPER('İbrahim') is 'İBRAHIM', which "ibrahim" never matches. So
// the text is folded here, in .NET, once when a row is saved (a "SearchKey"
// column) and once for the typed text; SQL then compares folded to folded
// with a plain, culture-free Contains. One rule for every text search in the
// app (ADR-001): names, emails and free text through a key; the ASCII codes
// the app generates (policy, claim and plate numbers) through Code.
public static class SearchText
{
    // The shadow column on Users, Customers, AuditEntries and ErrorGroups.
    public const string KeyProperty = "SearchKey";

    // Fits a 200-char name and a 256-char email, or an audit entry's label
    // and both values, with separators.
    public const int KeyMaxLength = 700;

    // Separates the parts of a key, so a search can't match across two
    // fields ("ova ibr" spanning a name and an email).
    private const char Separator = '\u001F';

    // Lower case, one rule for every I (I, İ, ı, i → i; Azerbaijani and
    // Turkish users type either), ё → е, NFC, whitespace collapsed.
    public static string Fold(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var normalized = text.Normalize(NormalizationForm.FormC);
        var builder = new StringBuilder(normalized.Length);
        var pendingSpace = false;
        foreach (var ch in normalized)
        {
            if (char.IsWhiteSpace(ch))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }
            // The combining dot that JavaScript's toLowerCase leaves after "İ".
            if (ch == '̇') continue;
            if (pendingSpace)
            {
                builder.Append(' ');
                pendingSpace = false;
            }
            builder.Append(ch switch
            {
                'I' or 'İ' or 'ı' => 'i',
                'Ё' or 'ё' => 'е',
                _ => char.ToLowerInvariant(ch),
            });
        }
        return builder.ToString();
    }

    // Typed text as the app stores its own codes (upper-case ASCII: "PG-2026-…",
    // "CL-2026-…", plates), so the column is compared as stored, with no
    // function around it. Folded first, so a typed "İ" or "ı" is an I.
    public static string Code(string? text) => Fold(text).ToUpperInvariant();

    // The stored key for a row: each part folded, joined by a separator no
    // folded search text contains, cut to the column size.
    public static string Key(params string?[] parts)
    {
        var key = string.Join(Separator, parts.Select(Fold).Where(p => p.Length > 0));
        return key.Length > KeyMaxLength ? key[..KeyMaxLength] : key;
    }
}
