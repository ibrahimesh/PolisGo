using System.Text;
using PolisGo.Application.Auth;
using PolisGo.Infrastructure.Auth;

namespace PolisGo.Tests.Auth;

public class BcryptPasswordHasherTests
{
    // BCrypt reads only the first 72 bytes, and Cyrillic or Azerbaijani
    // letters take two: two different valid passwords sharing their first 37
    // characters used to verify against each other.
    [Fact]
    public void Long_multi_byte_passwords_that_differ_only_at_the_end_do_not_match()
    {
        var prefix = "П1" + new string('ж', 35);
        var a = prefix + "aaaa";
        var b = prefix + "bbbb";
        Assert.Null(AuthValidation.PasswordError(a));
        Assert.Null(AuthValidation.PasswordError(b));
        Assert.True(Encoding.UTF8.GetByteCount(prefix) > 72);

        var hasher = new BcryptPasswordHasher();

        Assert.True(hasher.Verify(a, hasher.Hash(a)));
        Assert.False(hasher.Verify(b, hasher.Hash(a)));
    }
}

public class BcryptPasswordHasherUpgradeTests
{
    // Hashes stored before the pre-hash keep working, and are replaced with
    // the current scheme at the next successful sign-in.
    [Fact]
    public async Task A_legacy_hash_still_signs_in_and_is_upgraded()
    {
        using var fixture = new PolisGo.Tests.Infrastructure.SqliteTestDb();
        var hasher = new BcryptPasswordHasher();
        var user = new PolisGo.Tests.Infrastructure.TestData(fixture.Db).User(PolisGo.Domain.Enums.UserRole.Admin);
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword("Legacy-Passw0rd", 4);
        fixture.Db.SaveChanges();
        Assert.True(hasher.NeedsRehash(user.PasswordHash));

        var jwt = Microsoft.Extensions.Options.Options.Create(new JwtSettings
        {
            Issuer = "test-issuer", Audience = "test-audience",
            SecretKey = "this-is-a-very-long-test-secret-key-32chars", ExpiryMinutes = 60
        });
        var auth = new PolisGo.Application.Auth.AuthService(fixture.NewContext(), hasher, new JwtTokenGenerator(jwt));
        var response = await auth.LoginAsync(new PolisGo.Application.Auth.Dtos.LoginRequest(user.Email, "Legacy-Passw0rd"));

        Assert.False(string.IsNullOrEmpty(response.Token));
        using var check = fixture.NewContext();
        var stored = check.Users.Single(u => u.Id == user.Id).PasswordHash;
        Assert.False(hasher.NeedsRehash(stored));
        Assert.True(hasher.Verify("Legacy-Passw0rd", stored));
    }
}
