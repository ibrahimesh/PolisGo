namespace PolisGo.Domain.Entities;

public class PolicyType
{
    public Guid Id { get; set; }

    // Short machine-friendly code (e.g. "MTPL", "CASCO") for lookups and UI filters.
    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;
    public decimal BaseRate { get; set; }
    public string Description { get; set; } = null!;

    public ICollection<Policy> Policies { get; set; } = new List<Policy>();
}
