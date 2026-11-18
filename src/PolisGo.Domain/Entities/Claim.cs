using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

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

    // Null only on claims filed before these were collected.
    public IncidentType? IncidentType { get; set; }
    public string? Location { get; set; }

    public decimal ClaimedAmount { get; set; }

    // Nullable until an adjuster finalises the decision.
    public decimal? ApprovedAmount { get; set; }

    public ClaimStatus Status { get; set; }

    // Nullable: claims land in the queue before an adjuster picks them up.
    public Guid? AssignedAdjusterId { get; set; }
    public User? AssignedAdjuster { get; set; }

    public DateTime CreatedAt { get; set; }

    // Optimistic concurrency token. Guid keeps the type portable (no
    // provider-specific rowversion) and has value equality so EF's change
    // tracker sees modifications without needing a custom comparer. The
    // entity bumps this on every transition (see TransitionTo).
    public Guid RowVersion { get; set; } = Guid.NewGuid();

    public ICollection<ClaimStatusHistory> StatusHistory { get; set; } = new List<ClaimStatusHistory>();
    public ICollection<ClaimDocument> Documents { get; set; } = new List<ClaimDocument>();

    // ---------- Workflow ----------

    // Open = no decision yet; the customer can still add documents or withdraw.
    public bool IsOpen => Status is ClaimStatus.Submitted or ClaimStatus.UnderReview;

    public void Withdraw(Guid userId, string? reason = null)
    {
        if (!IsOpen)
        {
            throw new InvalidStateTransitionException(
                $"Claim {ClaimNumber} cannot be withdrawn from status {Status}; only Submitted or UnderReview is allowed.");
        }
        TransitionTo(ClaimStatus.Withdrawn, userId, reason);
    }

    public void StartReview(Guid adjusterId, string? comment = null)
    {
        if (Status != ClaimStatus.Submitted)
        {
            throw new InvalidStateTransitionException(
                $"Claim {ClaimNumber} cannot start review from status {Status}; only Submitted is allowed.");
        }

        AssignedAdjusterId = adjusterId;
        TransitionTo(ClaimStatus.UnderReview, adjusterId, comment);
    }

    public void Approve(decimal approvedAmount, Guid adjusterId, string comment, bool isAdmin = false)
    {
        EnsureUnderReviewAndAuthorised(adjusterId, isAdmin, action: "approve");

        if (approvedAmount <= 0)
        {
            throw new InvalidStateTransitionException(
                "Approved amount must be greater than zero.");
        }
        if (approvedAmount > ClaimedAmount)
        {
            throw new InvalidStateTransitionException(
                $"Approved amount ({approvedAmount}) cannot exceed the claimed amount ({ClaimedAmount}).");
        }

        ApprovedAmount = approvedAmount;
        TransitionTo(ClaimStatus.Approved, adjusterId, comment);
    }

    public void Reject(Guid adjusterId, string comment, bool isAdmin = false)
    {
        EnsureUnderReviewAndAuthorised(adjusterId, isAdmin, action: "reject");

        if (string.IsNullOrWhiteSpace(comment))
        {
            throw new InvalidStateTransitionException(
                "A rejection reason is required.");
        }

        TransitionTo(ClaimStatus.Rejected, adjusterId, comment);
    }

    public void MarkPaid(Guid userId, string? comment = null)
    {
        if (Status != ClaimStatus.Approved)
        {
            throw new InvalidStateTransitionException(
                $"Claim {ClaimNumber} cannot be paid from status {Status}; only Approved is allowed.");
        }
        TransitionTo(ClaimStatus.Paid, userId, comment);
    }

    private void EnsureUnderReviewAndAuthorised(Guid adjusterId, bool isAdmin, string action)
    {
        if (Status != ClaimStatus.UnderReview)
        {
            throw new InvalidStateTransitionException(
                $"Claim {ClaimNumber} cannot {action} from status {Status}; only UnderReview is allowed.");
        }

        // Once a claim is under review, only the assigned adjuster (or an Admin)
        // can finalise it — otherwise any adjuster could steal a decision.
        if (!isAdmin && AssignedAdjusterId != adjusterId)
        {
            throw new InvalidStateTransitionException(
                $"Only the assigned adjuster can {action} this claim.");
        }
    }

    // Appending history INSIDE the state-change method guarantees every
    // transition is auditable — no path through the aggregate skips it.
    private void TransitionTo(ClaimStatus to, Guid userId, string? comment)
    {
        var from = Status;
        Status = to;
        // Do NOT set Id explicitly: EF's SequentialGuid generator picks a
        // value on save. Pre-setting Guid.NewGuid() made EF misclassify the
        // new row as Modified (because its PK was non-default), producing an
        // UPDATE instead of INSERT.
        StatusHistory.Add(new ClaimStatusHistory
        {
            FromStatus = from,
            ToStatus = to,
            ChangedByUserId = userId,
            Comment = comment ?? string.Empty,
            ChangedAt = DateTime.UtcNow
        });

        // Fresh concurrency token on every transition — stale UPDATEs from
        // other transactions will fail the WHERE RowVersion=... check.
        RowVersion = Guid.NewGuid();
    }
}
