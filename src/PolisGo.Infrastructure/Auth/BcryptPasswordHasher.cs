using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Auth;

public class BcryptPasswordHasher : IPasswordHasher
{
    // Work factor 12 is a reasonable 2026 default: slow enough for brute-force
    // protection, fast enough for interactive logins.
    private const int WorkFactor = 12;

    public string Hash(string password)
        => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public bool Verify(string password, string hash)
    {
        // Guard against malformed hashes causing uncaught SaltParseExceptions
        // on seeded-but-corrupted data.
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
