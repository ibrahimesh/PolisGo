using PolisGo.Infrastructure.Auth;

namespace PolisGo.Tests.Auth;

public class JwtSettingsValidatorTests
{
    private static JwtSettings With(string key) =>
        new() { Issuer = "PolisGo", Audience = "PolisGo.Clients", SecretKey = key, ExpiryMinutes = 60 };

    // Keys that were ever printed in the repository are public: long enough,
    // but refused like a missing key.
    [Theory]
    [InlineData("SET-VIA-USER-SECRETS")]
    [InlineData("replace-with-at-least-32-chars-of-random-base64")]
    public void Refuses_a_published_placeholder_key(string key)
    {
        Assert.True(new JwtSettingsValidator().Validate(null, With(key)).Failed);
    }

    [Fact]
    public void Accepts_a_long_private_key()
    {
        Assert.True(new JwtSettingsValidator().Validate(null, With(Convert.ToBase64String(Guid.NewGuid().ToByteArray()) + "-private-signing-key")).Succeeded);
    }
}
