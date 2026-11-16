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
}
