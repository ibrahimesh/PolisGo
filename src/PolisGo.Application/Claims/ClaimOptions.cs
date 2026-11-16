namespace PolisGo.Application.Claims;

public class ClaimOptions
{
    public const string SectionName = "Claims";

    // Hard ceiling to stop a typo from submitting a seven-figure claim.
    // Overridable per environment through configuration.
    public decimal MaxClaimAmount { get; set; } = 50_000m;
}
