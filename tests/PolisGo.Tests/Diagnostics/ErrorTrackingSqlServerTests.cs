using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Diagnostics;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Diagnostics;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Diagnostics;

// Error tracking on the databases it runs on: bulk deletes with an id list,
// grouped sums, the unique fingerprint, the Reference index and the
// migration history the health probe reads. SQL Server is built by the
// real migrations.
[Trait("Category", "SqlServer")]
public class ErrorTrackingSqlServerTests
{
    [Fact]
    public Task The_lifecycle_works_on_sqlite() => Run(new FileSqliteDb(), migrated: false);

    [SqlServerFact]
    public Task The_lifecycle_works_on_sql_server() => Run(new SqlServerTestDb(), migrated: true);

    private static async Task Run(ITestDatabase database, bool migrated)
    {
        using var _ = database;
        var now = DateTime.UtcNow;
        Guid adminId;
        await using (var db = database.NewContext()) adminId = new TestData(db).User(UserRole.Admin).Id;
        var options = Options.Create(new ErrorTrackingOptions { MaxOccurrencesPerGroup = 5 });
        ErrorRecorder Recorder() => new(database.NewContext(), new ErrorRecorderTests.TestApp(), options);
        ErrorTrackingService Service() =>
            new(database.NewContext(), new FakeCurrentUser { UserId = adminId, Role = UserRole.Admin }, TimeProvider.System);

        // A burst: one group, five rows kept, every event counted.
        var burst = Enumerable.Range(0, 40).Select(i => ErrorRecorderTests.Backend(now.AddMilliseconds(-i))).ToList();
        await Recorder().RecordAsync(burst);
        await Recorder().RecordAsync([ErrorRecorderTests.Frontend(now, "Löschen fehlgeschlagen für «Ləman»")]);

        var newest = burst.MaxBy(r => r.OccurredAt)!;
        var found = await Service().ListAsync(new ErrorListQuery(Search: newest.TraceId[..8].ToUpperInvariant()));
        var row = Assert.Single(found.Items);
        Assert.Equal(40, row.OccurrenceCount);
        var detail = await Service().GetAsync(row.Id);
        Assert.Equal(5, detail.StoredOccurrenceCount);
        Assert.Equal(newest.TraceId, detail.Occurrences[0].TraceId);

        await Service().UpdateStatusAsync(row.Id, new UpdateErrorStatusRequest(ErrorStatus.Resolved, "ok", detail.RowVersion));
        await Recorder().RecordAsync([ErrorRecorderTests.Backend(now.AddSeconds(1))]);
        Assert.True((await Service().GetAsync(row.Id)).IsRegressed);

        var summary = await Service().SummaryAsync();
        Assert.Equal(42, summary.LastDay.Sum(b => b.Count));
        Assert.Equal(1, summary.Regressed);

        await using (var db = database.NewContext())
        {
            var (occurrences, _) = await ErrorRetention.RunAsync(db, now.AddDays(31), options.Value);
            Assert.Equal(6, occurrences);
            Assert.Equal(2, await db.ErrorGroups.CountAsync());
        }

        await using (var db = database.NewContext())
        {
            var health = await new DatabaseProbe(db).ProbeAsync();
            Assert.True(health.Reachable);
            if (migrated)
            {
                Assert.Empty(health.PendingMigrations);
                // The newest migration the app ships, whichever it is.
                Assert.Equal(db.Database.GetMigrations().Last(), health.LastAppliedMigration);
            }
        }
    }
}
