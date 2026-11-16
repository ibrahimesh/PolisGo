using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

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

    // State transitions live on the entity so controllers and services can't
    // bypass the guards by mutating Status directly.
    public void Activate()
    {
        if (Status != PolicyStatus.Draft)
        {
            throw new InvalidStateTransitionException(
                $"Policy {PolicyNumber} cannot be activated from status {Status}; only Draft is allowed.");
        }
        Status = PolicyStatus.Active;
    }

    public void Cancel()
    {
        if (Status is not (PolicyStatus.Draft or PolicyStatus.Active))
        {
            throw new InvalidStateTransitionException(
                $"Policy {PolicyNumber} cannot be cancelled from status {Status}; only Draft or Active is allowed.");
        }
        Status = PolicyStatus.Cancelled;
    }

    // Inclusive overlap: two policies share at least one day in their date ranges.
    // Caller is responsible for also matching on vehicle and type.
    public bool OverlapsWith(Policy other)
    {
        return StartDate <= other.EndDate && other.StartDate <= EndDate;
    }
}
