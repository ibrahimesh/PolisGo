using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

public class Claim
{
    public Guid Id { get; set; }

    // Printed on the claim form; separate from the internal Guid Id.
    public string ClaimNumber { get; set; } = null!;

    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;

    public DateTime IncidentDate { get; set; }
    public string Description { get; set; } = null!;

    public decimal ClaimedAmount { get; set; }

    // Nullable until an adjuster finalises the decision.
    public decimal? ApprovedAmount { get; set; }

    public ClaimStatus Status { get; set; }

    // Nullable: claims land in the queue before an adjuster picks them up.
    public Guid? AssignedAdjusterId { get; set; }
    public User? AssignedAdjuster { get; set; }

    public DateTime CreatedAt { get; set; }

    public ICollection<ClaimStatusHistory> StatusHistory { get; set; } = new List<ClaimStatusHistory>();
    public ICollection<ClaimDocument> Documents { get; set; } = new List<ClaimDocument>();
}
