using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Diagnostics;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Diagnostics;

public class ErrorTrackingServiceTests
{
    private static readonly DateTime Now = new(2026, 11, 24, 10, 30, 0, DateTimeKind.Utc);

    private sealed class Fixture : IDisposable
    {
        public SqliteTestDb Db { get; } = new();
        public User Admin { get; }
        public FakeClock Clock { get; } = new(new DateTimeOffset(Now));

        public Fixture() => Admin = new TestData(Db.Db).User(UserRole.Admin);

        public ErrorTrackingService Service() =>
            new(Db.NewContext(), new FakeCurrentUser { UserId = Admin.Id, Role = UserRole.Admin }, Clock);

        public async Task Record(params ErrorReport[] reports) =>
            await ErrorRecorderTests.Recorder(Db).RecordAsync(reports);

        public void Dispose() => Db.Dispose();
    }

    [Fact]
    public async Task Filters_narrow_by_source_status_status_code_role_and_endpoint()
    {
        using var f = new Fixture();
        await f.Record(
            ErrorRecorderTests.Backend(Now.AddHours(-1)),
            ErrorRecorderTests.Backend(Now.AddHours(-2), endpoint: "GET api/claims/{id}", status: 503),
            ErrorRecorderTests.Frontend(Now.AddMinutes(-5), "Chunk failed"));
        var sut = f.Service();

        Assert.Equal(3, (await sut.ListAsync(new ErrorListQuery())).TotalCount);
        Assert.Equal(1, (await sut.ListAsync(new ErrorListQuery(Source: ErrorSource.Frontend))).TotalCount);
        Assert.Equal(1, (await sut.ListAsync(new ErrorListQuery(HttpStatus: 503))).TotalCount);
        Assert.Equal(2, (await sut.ListAsync(new ErrorListQuery(Role: UserRole.Client))).TotalCount);
        Assert.Equal(1, (await sut.ListAsync(new ErrorListQuery(Endpoint: "API/CLAIMS"))).TotalCount);
        Assert.Equal(3, (await sut.ListAsync(new ErrorListQuery(Status: ErrorStatus.New))).TotalCount);
        Assert.Equal(0, (await sut.ListAsync(new ErrorListQuery(Regressed: true))).TotalCount);
        // Newest first by default; by count on request.
        var rows = (await sut.ListAsync(new ErrorListQuery())).Items;
        Assert.Equal(rows.OrderByDescending(r => r.LastSeenAt).Select(r => r.Id), rows.Select(r => r.Id));
    }

    [Theory]
    [InlineData("{code}")]
    [InlineData("{lower}")]
    [InlineData("{dashed}")]
    [InlineData("{spaced}")]
    [InlineData("{trace}")]
    [InlineData("00-{trace}-0123456789abcdef-01")]
    public async Task Search_accepts_a_reference_in_any_form(string pattern)
    {
        using var f = new Fixture();
        var target = ErrorRecorderTests.Backend(Now, endpoint: "GET api/claims/{id}");
        await f.Record(ErrorRecorderTests.Backend(Now), target);
        var code = target.TraceId[..8].ToUpperInvariant();
        var typed = pattern
            .Replace("{code}", code)
            .Replace("{lower}", code.ToLowerInvariant())
            .Replace("{dashed}", $"{code[..4]}-{code[4..]}")
            .Replace("{spaced}", $" {code[..4]} {code[4..]} ")
            .Replace("{trace}", target.TraceId);

        var found = await f.Service().ListAsync(new ErrorListQuery(Search: typed));

        var row = Assert.Single(found.Items);
        Assert.Equal("GET api/claims/{id}", row.Endpoint);
    }

    [Fact]
    public async Task Lookup_returns_the_occurrence_and_its_group()
    {
        using var f = new Fixture();
        var target = ErrorRecorderTests.Frontend(Now, "Crash in the wizard");
        await f.Record(target);

        var result = await f.Service().LookupAsync(target.TraceId[..4] + "-" + target.TraceId[4..8]);

        Assert.Equal(target.TraceId, result.Occurrence.TraceId);
        Assert.Equal(ErrorSource.Frontend, result.Group.Source);
        Assert.Equal(1, result.Matches);
        await Assert.ThrowsAsync<NotFoundException>(() => f.Service().LookupAsync("00000000"));
        await Assert.ThrowsAsync<ValidationException>(() => f.Service().LookupAsync("nope"));
    }

    [Fact]
    public async Task Triage_changes_status_with_the_loaded_row_version_and_is_audited()
    {
        using var f = new Fixture();
        await f.Record(ErrorRecorderTests.Backend(Now));
        var group = (await f.Service().ListAsync(new ErrorListQuery())).Items.Single();

        var resolved = await f.Service().UpdateStatusAsync(group.Id,
            new UpdateErrorStatusRequest(ErrorStatus.Resolved, " Fixed in 1.4.1 ", group.RowVersion));

        Assert.Equal(ErrorStatus.Resolved, resolved.Status);
        Assert.Equal("Fixed in 1.4.1", resolved.Note);
        Assert.Equal(f.Admin.FullName, resolved.ResolvedByName);
        // The old version is stale now.
        await Assert.ThrowsAsync<ConcurrencyConflictException>(() => f.Service().UpdateStatusAsync(group.Id,
            new UpdateErrorStatusRequest(ErrorStatus.Ignored, null, group.RowVersion)));
        // Same status again is a 409 through the entity.
        await Assert.ThrowsAsync<InvalidStateTransitionException>(() => f.Service().UpdateStatusAsync(group.Id,
            new UpdateErrorStatusRequest(ErrorStatus.Resolved, null, resolved.RowVersion)));
        await Assert.ThrowsAsync<ValidationException>(() => f.Service().UpdateStatusAsync(group.Id,
            new UpdateErrorStatusRequest(ErrorStatus.New, new string('n', 1001), resolved.RowVersion)));

        await using var db = f.Db.NewContext();
        var entry = await db.AuditEntries.SingleAsync();
        Assert.Equal(AuditAction.ErrorResolved, entry.Action);
        Assert.Equal(group.Id, entry.SubjectId);
        Assert.Equal(("New", "Resolved"), (entry.FromValue, entry.ToValue));
        Assert.Equal(f.Admin.Id, entry.ActorUserId);
    }

    [Fact]
    public async Task A_regression_shows_in_the_filters_and_the_summary()
    {
        using var f = new Fixture();
        await f.Record(ErrorRecorderTests.Backend(Now.AddHours(-3)));
        var group = (await f.Service().ListAsync(new ErrorListQuery())).Items.Single();
        await f.Service().UpdateStatusAsync(group.Id, new UpdateErrorStatusRequest(ErrorStatus.Resolved, null, group.RowVersion));

        await f.Record(ErrorRecorderTests.Backend(Now.AddMinutes(-1)));

        var regressed = await f.Service().ListAsync(new ErrorListQuery(Regressed: true));
        Assert.Equal(group.Id, Assert.Single(regressed.Items).Id);
        var summary = await f.Service().SummaryAsync();
        Assert.Equal(1, summary.Regressed);
        Assert.Equal(1, summary.Unresolved);
        Assert.Equal(24, summary.LastDay.Count);
        Assert.Equal(7, summary.LastWeek.Count);
        Assert.Equal(2, summary.LastDay.Sum(b => b.Count));
        Assert.Equal(2, summary.LastWeek.Sum(b => b.Count));
        Assert.Equal(group.Id, Assert.Single(summary.Top).Id);
    }

    [Fact]
    public async Task Purging_removes_only_resolved_groups_older_than_asked_and_is_audited()
    {
        using var f = new Fixture();
        await f.Record(ErrorRecorderTests.Backend(Now.AddDays(-60)), ErrorRecorderTests.Frontend(Now, "Still open"));
        var old = (await f.Service().ListAsync(new ErrorListQuery(Source: ErrorSource.Backend))).Items.Single();
        f.Clock.Now = new DateTimeOffset(Now.AddDays(-45));
        await f.Service().UpdateStatusAsync(old.Id, new UpdateErrorStatusRequest(ErrorStatus.Resolved, null, old.RowVersion));
        f.Clock.Now = new DateTimeOffset(Now);

        Assert.Equal(0, (await f.Service().PurgeResolvedAsync(60)).Deleted);
        Assert.Equal(1, (await f.Service().PurgeResolvedAsync(30)).Deleted);
        await Assert.ThrowsAsync<ValidationException>(() => f.Service().PurgeResolvedAsync(0));

        await using var db = f.Db.NewContext();
        Assert.Equal(1, await db.ErrorGroups.CountAsync());
        Assert.Equal(1, await db.ErrorOccurrences.CountAsync());
        Assert.Equal(1, await db.AuditEntries.CountAsync(a => a.Action == AuditAction.ErrorsPurged));
    }

    [Fact]
    public async Task Retention_drops_old_occurrences_and_keeps_groups_and_counts()
    {
        using var f = new Fixture();
        await f.Record(ErrorRecorderTests.Backend(Now.AddDays(-40)), ErrorRecorderTests.Backend(Now.AddDays(-1)));

        await using (var db = f.Db.NewContext())
        {
            var (occurrences, counters) = await ErrorRetention.RunAsync(db, Now,
                new ErrorTrackingOptions { OccurrenceRetentionDays = 30, CounterRetentionDays = 90 });
            Assert.Equal(1, occurrences);
            Assert.Equal(0, counters);
        }

        await using var check = f.Db.NewContext();
        var group = await check.ErrorGroups.SingleAsync();
        Assert.Equal(2, group.OccurrenceCount);
        Assert.Equal(1, await check.ErrorOccurrences.CountAsync());
        Assert.Equal(2, await check.ErrorHourlyCounts.SumAsync(c => c.Count));
    }

    [Fact]
    public async Task Triage_shows_in_the_audit_log_as_an_error_event()
    {
        using var f = new Fixture();
        await f.Record(ErrorRecorderTests.Backend(Now));
        var group = (await f.Service().ListAsync(new ErrorListQuery())).Items.Single();
        await f.Service().UpdateStatusAsync(group.Id, new UpdateErrorStatusRequest(ErrorStatus.Ignored, null, group.RowVersion));

        var feed = await new PolisGo.Application.Admin.AuditLogService(f.Db.NewContext())
            .ListAsync(new PolisGo.Application.Admin.Dtos.AuditLogQuery(EntityType: PolisGo.Application.Admin.Dtos.AuditEntityType.Error));

        var row = Assert.Single(feed.Items);
        Assert.Equal("ErrorIgnored", row.Action);
        Assert.Equal(group.Id, row.EntityId);
        Assert.Equal(PolisGo.Application.Admin.Dtos.AuditEntityType.Error, row.EntityType);
    }
}
