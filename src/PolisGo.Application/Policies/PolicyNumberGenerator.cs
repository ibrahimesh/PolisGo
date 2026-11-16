using System.Security.Cryptography;

namespace PolisGo.Application.Policies;

// Readable, unique-ish policy number: PG-{year}-{8 base32 chars}.
// Generated with a CSPRNG so we don't need to worry about predictability.
// Service-side collision checks + retry on save guarantee uniqueness.
internal static class PolicyNumberGenerator
{
    // Crockford-ish alphabet without easily confused characters (no 0/O, 1/I/L).
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string Generate(int year)
    {
        Span<byte> randomBytes = stackalloc byte[8];
        RandomNumberGenerator.Fill(randomBytes);

        Span<char> chars = stackalloc char[8];
        for (var i = 0; i < 8; i++)
        {
            chars[i] = Alphabet[randomBytes[i] % Alphabet.Length];
        }

        return $"PG-{year}-{new string(chars)}";
    }
}
