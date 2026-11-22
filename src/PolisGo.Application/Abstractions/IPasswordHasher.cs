namespace PolisGo.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);

    // True for a hash made by an older scheme: re-hash the password (known
    // at sign-in) so the stored hash moves to the current one.
    bool NeedsRehash(string hash);
}
