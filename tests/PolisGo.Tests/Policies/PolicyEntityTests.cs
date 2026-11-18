using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;
using Xunit;

namespace PolisGo.Tests.Policies;

public class PolicyEntityTests
{
    private static Policy Draft(DateTime? start = null, DateTime? end = null) => new()
    {
        Id = Guid.NewGuid(),
        PolicyNumber = "PG-2026-TEST0000",
        Status = PolicyStatus.Draft,
        StartDate = start ?? new DateTime(2026, 1, 1),
        EndDate = end ?? new DateTime(2026, 12, 31)
    };

    [Fact]
    public void Activate_FromDraft_MovesToActive()
    {
        var policy = Draft();
        policy.Activate();
        Assert.Equal(PolicyStatus.Active, policy.Status);
    }

    [Theory]
    [InlineData(PolicyStatus.Active)]
    [InlineData(PolicyStatus.Expired)]
    [InlineData(PolicyStatus.Cancelled)]
    public void Activate_FromNonDraft_Throws(PolicyStatus startingStatus)
    {
        var policy = Draft();
        policy.Status = startingStatus;
        Assert.Throws<InvalidStateTransitionException>(() => policy.Activate());
    }

    [Theory]
    [InlineData(PolicyStatus.Draft)]
    [InlineData(PolicyStatus.Active)]
    public void Cancel_FromDraftOrActive_MovesToCancelled(PolicyStatus startingStatus)
    {
        var policy = Draft();
        policy.Status = startingStatus;
        policy.Cancel();
        Assert.Equal(PolicyStatus.Cancelled, policy.Status);
    }

    [Theory]
    [InlineData(PolicyStatus.Expired)]
    [InlineData(PolicyStatus.Cancelled)]
    public void Cancel_FromTerminalStatus_Throws(PolicyStatus startingStatus)
    {
        var policy = Draft();
        policy.Status = startingStatus;
        Assert.Throws<InvalidStateTransitionException>(() => policy.Cancel());
    }

    [Fact]
    public void Overlaps_IdenticalRanges_IsTrue()
    {
        var a = Draft(new DateTime(2026, 1, 1), new DateTime(2026, 6, 30));
        var b = Draft(new DateTime(2026, 1, 1), new DateTime(2026, 6, 30));
        Assert.True(a.OverlapsWith(b));
    }

    [Fact]
    public void Overlaps_RangesTouchAtSingleDay_IsTrue()
    {
        var a = Draft(new DateTime(2026, 1, 1), new DateTime(2026, 6, 30));
        var b = Draft(new DateTime(2026, 6, 30), new DateTime(2026, 12, 31));
        Assert.True(a.OverlapsWith(b));
    }

    [Fact]
    public void Overlaps_RangesStrictlyBeforeAndAfter_IsFalse()
    {
        var a = Draft(new DateTime(2026, 1, 1), new DateTime(2026, 6, 30));
        var b = Draft(new DateTime(2026, 7, 1), new DateTime(2026, 12, 31));
        Assert.False(a.OverlapsWith(b));
    }

    [Fact]
    public void Every_transition_appends_a_history_row_with_the_actor()
    {
        var actor = Guid.NewGuid();
        var policy = Draft();

        policy.RecordIssued(actor);
        policy.Activate(actor);
        policy.Cancel(actor);

        Assert.Equal(
            [(null, PolicyStatus.Draft), (PolicyStatus.Draft, PolicyStatus.Active), (PolicyStatus.Active, PolicyStatus.Cancelled)],
            policy.StatusHistory.Select(h => (h.FromStatus, h.ToStatus)));
        Assert.All(policy.StatusHistory, h => Assert.Equal(actor, h.ChangedByUserId));
    }

    [Fact]
    public void RecordIssued_twice_throws()
    {
        var policy = Draft();
        policy.RecordIssued(null);
        Assert.Throws<InvalidStateTransitionException>(() => policy.RecordIssued(null));
    }

    [Fact]
    public void A_failed_transition_leaves_no_history()
    {
        var policy = Draft();
        policy.Status = PolicyStatus.Cancelled;
        Assert.Throws<InvalidStateTransitionException>(() => policy.Activate());
        Assert.Empty(policy.StatusHistory);
    }

    [Theory]
    [InlineData(PolicyStatus.Active, "2026-12-31", PolicyStatus.Active)]   // last covered day
    [InlineData(PolicyStatus.Active, "2027-01-01", PolicyStatus.Expired)]  // day after the end
    [InlineData(PolicyStatus.Draft, "2027-06-01", PolicyStatus.Draft)]     // drafts never expire
    [InlineData(PolicyStatus.Cancelled, "2027-06-01", PolicyStatus.Cancelled)]
    public void StatusOn_derives_expiry_from_the_inclusive_end_date(PolicyStatus stored, string on, PolicyStatus expected)
    {
        var policy = Draft();
        policy.Status = stored;
        Assert.Equal(expected, policy.StatusOn(DateOnly.Parse(on)));
    }
}
