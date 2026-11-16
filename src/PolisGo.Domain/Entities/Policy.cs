using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

public class Policy
{
    public Guid Id { get; set; }

    // Human-readable identifier shown on the document itself; globally unique.
    public string PolicyNumber { get; set; } = null!;

    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;

    public Guid VehicleId { get; set; }
    public Vehicle Vehicle { get; set; } = null!;

    public Guid PolicyTypeId { get; set; }
    public PolicyType PolicyType { get; set; } = null!;

    // Nullable: a policy sold through self-service has no agent attached.
    public Guid? AgentId { get; set; }
    public User? Agent { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    public decimal Premium { get; set; }
    public PolicyStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<Claim> Claims { get; set; } = new List<Claim>();
}
