using System.ComponentModel.DataAnnotations;

namespace PolisGo.Infrastructure.Auth;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    [Required]
    public string Issuer { get; set; } = null!;

    [Required]
    public string Audience { get; set; } = null!;

    // Validated by a dedicated IValidateOptions impl so we can enforce the
    // 32-char minimum alongside the DataAnnotation Required check.
    [Required]
    public string SecretKey { get; set; } = null!;

    [Range(1, 24 * 60)]
    public int ExpiryMinutes { get; set; } = 60;
}
