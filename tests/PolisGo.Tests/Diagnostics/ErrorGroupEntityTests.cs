using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

namespace PolisGo.Tests.Diagnostics;

// The error group's lifecycle: counting, regression, and triage by hand.
public class ErrorGroupEntityTests
{
    private static readonly DateTime T0 = new(2026, 11, 24, 8, 0, 0, DateTimeKind.Utc);

    private static ErrorGroup Group(ErrorStatus status = ErrorStatus.New) => new()
    {
        Id = Guid.NewGuid(), Fingerprint = new string('a', 64), Source = ErrorSource.Backend, Title = "Boom",
        ExceptionType = "System.InvalidOperationException", Endpoint = "GET api/x", FirstSeenAt = T0,
        LastSeenAt = T0, OccurrenceCount = 1, Status = status
    };

    [Fact]
    public void Counting_moves_last_seen_and_keeps_the_row_version()
    {
        var group = Group();
        var version = group.RowVersion;

        var regressed = group.Record(3, T0.AddMinutes(5), 500);

        Assert.False(regressed);
        Assert.Equal(4, group.OccurrenceCount);
        Assert.Equal(T0.AddMinutes(5), group.LastSeenAt);
        Assert.Equal(500, group.LastHttpStatus);
        // A busy error must not make every admin's triage a conflict.
        Assert.Equal(version, group.RowVersion);
    }

    [Fact]
    public void A_resolved_group_that_occurs_again_reopens_as_regressed()
    {
        var admin = Guid.NewGuid();
        var group = Group();
        group.Resolve(admin, T0.AddHours(1), "Fixed in 1.2");
        var resolvedVersion = group.RowVersion;

        var regressed = group.Record(1, T0.AddHours(2), 500);

        Assert.True(regressed);
        Assert.Equal(ErrorStatus.New, group.Status);
        Assert.True(group.IsRegressed);
        Assert.Equal(T0.AddHours(2), group.RegressedAt);
        Assert.NotEqual(resolvedVersion, group.RowVersion);
    }

    [Fact]
    public void An_ignored_group_keeps_counting_silently()
    {
        var group = Group();
        group.Ignore(Guid.NewGuid(), T0, "Browser extension noise");

        Assert.False(group.Record(10, T0.AddDays(1), null));
        Assert.Equal(ErrorStatus.Ignored, group.Status);
        Assert.False(group.IsRegressed);
        Assert.Equal(11, group.OccurrenceCount);
    }

    [Fact]
    public void Resolving_clears_the_regression_and_records_who_and_why()
    {
        var admin = Guid.NewGuid();
        var group = Group(ErrorStatus.Resolved);
        group.Record(1, T0.AddHours(1), 500);

        group.Resolve(admin, T0.AddHours(2), "Really fixed");

        Assert.Equal(ErrorStatus.Resolved, group.Status);
        Assert.False(group.IsRegressed);
        Assert.Equal(admin, group.ResolvedByUserId);
        Assert.Equal("Really fixed", group.Note);
    }

    [Fact]
    public void Reopening_by_hand_is_not_a_regression_and_same_status_is_refused()
    {
        var group = Group();
        Assert.Throws<InvalidStateTransitionException>(() => group.Reopen(null));
        group.Ignore(Guid.NewGuid(), T0, null);
        Assert.Throws<InvalidStateTransitionException>(() => group.Ignore(Guid.NewGuid(), T0, null));

        group.Reopen("Not noise after all");

        Assert.Equal(ErrorStatus.New, group.Status);
        Assert.False(group.IsRegressed);
        Assert.Null(group.ResolvedByUserId);
        Assert.Throws<ArgumentOutOfRangeException>(() => group.Record(0, T0, null));
    }
}
