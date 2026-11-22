using System.Security.Cryptography;
using System.Text;
using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Auth;

public class BcryptPasswordHasher : IPasswordHasher
{
    // Work factor 12 is a reasonable 2026 default: slow enough for brute-force
    // protection, fast enough for interactive logins.
    private const int WorkFactor = 12;

    // BCrypt reads only the first 72 bytes of its input, and Cyrillic or
    // Azerbaijani letters take two bytes each: two long passwords sharing
    // their first ~36 letters would match. So the password is first reduced
    // to a fixed 44-character SHA-256 (base64, no NUL bytes) and that is
    // bcrypted. The prefix marks hashes made this way; older plain-bcrypt
    // hashes still verify and are upgraded at the next sign-in.
    private const string PreHashedPrefix = "$pg1$";

    public string Hash(string password)
        => PreHashedPrefix + BCrypt.Net.BCrypt.HashPassword(PreHash(password), WorkFactor);

    public bool Verify(string password, string hash)
    {
        // Guard against malformed hashes causing uncaught SaltParseExceptions
        // on seeded-but-corrupted data.
        try
        {
            return hash.StartsWith(PreHashedPrefix, StringComparison.Ordinal)
                ? BCrypt.Net.BCrypt.Verify(PreHash(password), hash[PreHashedPrefix.Length..])
                : BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }

    public bool NeedsRehash(string hash) => !hash.StartsWith(PreHashedPrefix, StringComparison.Ordinal);

    private static string PreHash(string password)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
}
