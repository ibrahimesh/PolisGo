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

    // Factors behind Premium, frozen at issue; null on legacy rows.
    public PolicyPricing? Pricing { get; set; }

    // Optimistic concurrency token, as on Claim: every transition sets a new
    // value, so of two requests that read the same Draft only one can pay it.
    public Guid RowVersion { get; set; } = Guid.NewGuid();

    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<Claim> Claims { get; set; } = new List<Claim>();
    public ICollection<PolicyStatusHistory> StatusHistory { get; set; } = new List<PolicyStatusHistory>();

    // Nothing stores the move from Active to Expired (there is no scheduler),
    // so it is derived: cover runs through EndDate inclusive and is over on
    // the day after.
    public PolicyStatus StatusOn(DateOnly date) =>
        Status == PolicyStatus.Active && DateOnly.FromDateTime(EndDate) < date
            ? PolicyStatus.Expired
            : Status;

    // First history row; call once, right after building a new Draft.
    public void RecordIssued(Guid? byUserId)
    {
        if (Status != PolicyStatus.Draft || StatusHistory.Count > 0)
        {
            throw new InvalidStateTransitionException(
                $"Policy {PolicyNumber} has already been issued.");
        }
        StatusHistory.Add(new PolicyStatusHistory
        {
            FromStatus = null,
            ToStatus = PolicyStatus.Draft,
            ChangedByUserId = byUserId,
            ChangedAt = CreatedAt == default ? DateTime.UtcNow : CreatedAt
        });
    }

    // State transitions live on the entity so controllers and services can't
    // bypass the guards by mutating Status directly.
    public void Activate(Guid? byUserId = null)
    {
        if (Status != PolicyStatus.Draft)
        {
            throw new InvalidStateTransitionException(
                $"Policy {PolicyNumber} cannot be activated from status {Status}; only Draft is allowed.");
        }
        TransitionTo(PolicyStatus.Active, byUserId);
    }

    public void Cancel(Guid? byUserId = null)
    {
        if (Status is not (PolicyStatus.Draft or PolicyStatus.Active))
        {
            throw new InvalidStateTransitionException(
                $"Policy {PolicyNumber} cannot be cancelled from status {Status}; only Draft or Active is allowed.");
        }
        TransitionTo(PolicyStatus.Cancelled, byUserId);
    }

    // Inclusive overlap: two policies share at least one day in their date ranges.
    // Caller is responsible for also matching on vehicle and type.
    public bool OverlapsWith(Policy other)
    {
        return StartDate <= other.EndDate && other.StartDate <= EndDate;
    }

    private void TransitionTo(PolicyStatus to, Guid? byUserId)
    {
        // Id is left unset on purpose: EF generates it on save (see Claim).
        StatusHistory.Add(new PolicyStatusHistory
        {
            FromStatus = Status,
            ToStatus = to,
            ChangedByUserId = byUserId,
            ChangedAt = DateTime.UtcNow
        });
        Status = to;
        RowVersion = Guid.NewGuid();
    }
}
