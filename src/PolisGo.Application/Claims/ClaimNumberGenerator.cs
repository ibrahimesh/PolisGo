using System.Security.Cryptography;

namespace PolisGo.Application.Claims;

// Readable ClaimNumber: CL-{year}-{8 base32 chars}.
// Same alphabet style as PolicyNumberGenerator — avoids the characters humans
// routinely confuse when reading out loud or re-typing from paper.
internal static class ClaimNumberGenerator
{
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

        return $"CL-{year}-{new string(chars)}";
    }
}
