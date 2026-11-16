using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;
using Xunit;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Tests.Claims;

public class ClaimEntityTests
{
    private static DomainClaim NewClaim(ClaimStatus status, Guid? assignedAdjusterId = null)
    {
        return new DomainClaim
        {
            Id = Guid.NewGuid(),
            ClaimNumber = "CL-2026-ABC12345",
            PolicyId = Guid.NewGuid(),
            IncidentDate = DateTime.UtcNow.AddDays(-7),
            Description = "Test incident",
            ClaimedAmount = 1_000m,
            Status = status,
            AssignedAdjusterId = assignedAdjusterId,
            CreatedAt = DateTime.UtcNow
        };
    }

    // ---------- Valid transitions ----------

    [Fact]
    public void StartReview_FromSubmitted_SetsUnderReviewAndAssignsAdjuster()
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.Submitted);

        claim.StartReview(adjusterId, "picked up");

        Assert.Equal(ClaimStatus.UnderReview, claim.Status);
        Assert.Equal(adjusterId, claim.AssignedAdjusterId);
        Assert.Single(claim.StatusHistory);
        var history = claim.StatusHistory.First();
        Assert.Equal(ClaimStatus.Submitted, history.FromStatus);
        Assert.Equal(ClaimStatus.UnderReview, history.ToStatus);
        Assert.Equal(adjusterId, history.ChangedByUserId);
        Assert.Equal("picked up", history.Comment);
    }

    [Fact]
    public void Approve_FromUnderReviewByAssignedAdjuster_Succeeds()
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, adjusterId);

        claim.Approve(500m, adjusterId, "approved");

        Assert.Equal(ClaimStatus.Approved, claim.Status);
        Assert.Equal(500m, claim.ApprovedAmount);
        Assert.Single(claim.StatusHistory);
        Assert.Equal(ClaimStatus.UnderReview, claim.StatusHistory.Single().FromStatus);
    }

    [Fact]
    public void Approve_ByAdminEvenIfNotAssigned_Succeeds()
    {
        var assignedAdjuster = Guid.NewGuid();
        var someoneElse = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, assignedAdjuster);

        claim.Approve(500m, someoneElse, "override", isAdmin: true);
        Assert.Equal(ClaimStatus.Approved, claim.Status);
    }

    [Fact]
    public void Reject_FromUnderReviewWithComment_Succeeds()
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, adjusterId);

        claim.Reject(adjusterId, "no evidence provided");

        Assert.Equal(ClaimStatus.Rejected, claim.Status);
    }

    [Fact]
    public void MarkPaid_FromApproved_Succeeds()
    {
        var claim = NewClaim(ClaimStatus.Approved);
        claim.MarkPaid(Guid.NewGuid(), "paid out");
        Assert.Equal(ClaimStatus.Paid, claim.Status);
        Assert.Single(claim.StatusHistory);
    }

    // ---------- Invalid transitions (StartReview) ----------

    [Theory]
    [InlineData(ClaimStatus.UnderReview)]
    [InlineData(ClaimStatus.Approved)]
    [InlineData(ClaimStatus.Rejected)]
    [InlineData(ClaimStatus.Paid)]
    public void StartReview_FromNonSubmitted_Throws(ClaimStatus status)
    {
        var claim = NewClaim(status);
        Assert.Throws<InvalidStateTransitionException>(() => claim.StartReview(Guid.NewGuid()));
    }

    // ---------- Invalid transitions (Approve) ----------

    [Theory]
    [InlineData(ClaimStatus.Submitted)]
    [InlineData(ClaimStatus.Approved)]
    [InlineData(ClaimStatus.Rejected)]
    [InlineData(ClaimStatus.Paid)]
    public void Approve_FromNonUnderReview_Throws(ClaimStatus status)
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(status, adjusterId);
        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Approve(100m, adjusterId, "ok"));
    }

    [Fact]
    public void Approve_ByNonAssignedNonAdmin_Throws()
    {
        var assigned = Guid.NewGuid();
        var someoneElse = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, assigned);

        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Approve(100m, someoneElse, "sneaky"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-100)]
    [InlineData(1500)]
    public void Approve_WithInvalidAmount_Throws(decimal amount)
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, adjusterId);
        // Claimed amount in NewClaim is 1000, so 1500 exceeds claimed.
        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Approve(amount, adjusterId, "ok"));
    }

    // ---------- Invalid transitions (Reject) ----------

    [Theory]
    [InlineData(ClaimStatus.Submitted)]
    [InlineData(ClaimStatus.Approved)]
    [InlineData(ClaimStatus.Rejected)]
    public void Reject_FromNonUnderReview_Throws(ClaimStatus status)
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(status, adjusterId);
        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Reject(adjusterId, "nope"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Reject_WithoutComment_Throws(string comment)
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, adjusterId);
        Assert.Throws<InvalidStateTransitionException>(() => claim.Reject(adjusterId, comment));
    }

    [Fact]
    public void Reject_ByNonAssignedNonAdmin_Throws()
    {
        var assigned = Guid.NewGuid();
        var someoneElse = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.UnderReview, assigned);
        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Reject(someoneElse, "sneaky"));
    }

    // ---------- Invalid transitions (MarkPaid) ----------

    [Theory]
    [InlineData(ClaimStatus.Submitted)]
    [InlineData(ClaimStatus.UnderReview)]
    [InlineData(ClaimStatus.Rejected)]
    [InlineData(ClaimStatus.Paid)]
    public void MarkPaid_FromNonApproved_Throws(ClaimStatus status)
    {
        var claim = NewClaim(status);
        Assert.Throws<InvalidStateTransitionException>(() => claim.MarkPaid(Guid.NewGuid()));
    }

    // ---------- History is appended ON EVERY transition ----------

    [Fact]
    public void FullWorkflow_RecordsOneHistoryRowPerTransition()
    {
        var adjusterId = Guid.NewGuid();
        var claim = NewClaim(ClaimStatus.Submitted);

        claim.StartReview(adjusterId, "picked up");
        claim.Approve(1_000m, adjusterId, "ok");
        claim.MarkPaid(adjusterId, "disbursed");

        Assert.Equal(3, claim.StatusHistory.Count);
        Assert.Equal(new[] { ClaimStatus.UnderReview, ClaimStatus.Approved, ClaimStatus.Paid },
            claim.StatusHistory.Select(h => h.ToStatus));
    }
}
