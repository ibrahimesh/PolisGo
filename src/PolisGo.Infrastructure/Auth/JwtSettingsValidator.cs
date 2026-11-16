using Microsoft.Extensions.Options;

namespace PolisGo.Infrastructure.Auth;

// Runs at startup (via ValidateOnStart) so the process fails fast with a clear
// error rather than issuing tokens signed with an empty or placeholder key.
public class JwtSettingsValidator : IValidateOptions<JwtSettings>
{
    private const int MinSecretLength = 32;
    private const string Placeholder = "SET-VIA-USER-SECRETS";

    public ValidateOptionsResult Validate(string? name, JwtSettings options)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Issuer))
            errors.Add("Jwt:Issuer must be configured.");

        if (string.IsNullOrWhiteSpace(options.Audience))
            errors.Add("Jwt:Audience must be configured.");

        if (string.IsNullOrWhiteSpace(options.SecretKey) || options.SecretKey == Placeholder)
        {
            errors.Add(
                $"Jwt:SecretKey is missing. Set it with: " +
                $"dotnet user-secrets set \"Jwt:SecretKey\" \"<at-least-{MinSecretLength}-chars>\" " +
                $"--project src/PolisGo.Api");
        }
        else if (options.SecretKey.Length < MinSecretLength)
        {
            errors.Add($"Jwt:SecretKey must be at least {MinSecretLength} characters long.");
        }

        if (options.ExpiryMinutes <= 0)
            errors.Add("Jwt:ExpiryMinutes must be greater than zero.");

        return errors.Count > 0
            ? ValidateOptionsResult.Fail(errors)
            : ValidateOptionsResult.Success;
    }
}
