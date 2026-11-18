namespace PolisGo.Domain.Enums;

public enum ClaimStatus
{
    Submitted,
    UnderReview,
    Approved,
    Rejected,
    Paid,
    // The customer took the claim back before a decision. Final.
    Withdrawn
}
