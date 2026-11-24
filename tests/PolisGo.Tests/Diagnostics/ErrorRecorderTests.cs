using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Diagnostics;

// The writer's storage rules: one bug is one group however often it
// happens, rows stay bounded, text is redacted at rest, a resolved bug that
// comes back reopens itself.
public class ErrorRecorderTests
{
    private static readonly DateTime T0 = new(2026, 11, 24, 9, 15, 0, DateTimeKind.Utc);

    internal sealed class TestApp : IAppInfo
    {
        public string Version => "1.4.0";
        public string Build => "abc123";
        public string Environment => "Testing";
        public DateTime StartedAtUtc => T0;
    }

    internal static ErrorRecorder Recorder(SqliteTestDb fixture, int maxPerGroup = 20, int maxClientGroups = 50) =>
        new(fixture.NewContext(), new TestApp(), Options.Create(new ErrorTrackingOptions
        {
            MaxOccurrencesPerGroup = maxPerGroup,
            MaxNewClientGroupsPerHour = maxClientGroups
        }));

    internal static ErrorReport Backend(DateTime at, string message = "Payment failed", string endpoint = "POST api/policies/{id}/pay",
        int status = 500) =>
        new(ErrorSource.Backend, at, ErrorReference.NewTraceId(), "System.InvalidOperationException", message,
            $"System.InvalidOperationException: {message}\n   at PolisGo.Application.Policies.PolicyService.PayAsync() in /src/src/PolisGo.Application/Policies/PolicyService.cs:line 270",
            ["PolisGo.Application.Policies.PolicyService.PayAsync"], endpoint, status, "POST", endpoint[5..],
            UserRole.Client, Guid.NewGuid(), "Mozilla/5.0 Chrome/131.0 Safari/537.36");

    internal static ErrorReport Frontend(DateTime at, string message, string route = "/app/claims/:id", string? traceId = null) =>
        new(ErrorSource.Frontend, at, traceId ?? ErrorReference.NewTraceId(), "TypeError", message, "TypeError: x\n    at render",
            [ErrorFingerprint.MessageTemplate(message)], route, null, null, null, null, null,
            "Mozilla/5.0 Firefox/132.0", route, "2.0.1");

    [Fact]
    public async Task Ten_thousand_identical_errors_are_one_group_with_a_count_and_a_few_rows()
    {
        using var fixture = new SqliteTestDb();
        var reports = Enumerable.Range(0, 10_000).Select(i => Backend(T0.AddMilliseconds(i), $"Payment {i} failed")).ToList();

        foreach (var chunk in reports.Chunk(500)) await Recorder(fixture, maxPerGroup: 20).RecordAsync(chunk);

        await using var db = fixture.NewContext();
        var group = await db.ErrorGroups.SingleAsync();
        Assert.Equal(10_000, group.OccurrenceCount);
        Assert.Equal(T0, group.FirstSeenAt);
        Assert.Equal(T0.AddMilliseconds(9_999), group.LastSeenAt);
        Assert.Equal(20, await db.ErrorOccurrences.CountAsync());
        // The newest ones are kept.
        Assert.Equal(T0.AddMilliseconds(9_999), await db.ErrorOccurrences.MaxAsync(o => o.OccurredAt));
        Assert.Equal(10_000, await db.ErrorHourlyCounts.SumAsync(c => c.Count));
        Assert.Equal(10_000, await db.ErrorHourlyCounts.SumAsync(c => c.ServerErrorCount));
    }

    [Fact]
    public async Task Stored_text_is_redacted_and_the_occurrence_carries_its_reference()
    {
        using var fixture = new SqliteTestDb();
        var report = Backend(T0, "Payment for leyla@polisgo.az with card 4111 1111 1111 1111 via https://psp.test/pay?key=secret failed");

        await Recorder(fixture).RecordAsync([report]);

        await using var db = fixture.NewContext();
        var group = await db.ErrorGroups.SingleAsync();
        var stored = await db.ErrorOccurrences.SingleAsync();
        foreach (var text in new[] { group.Title, stored.Message, stored.StackTrace! })
        {
            Assert.DoesNotContain("leyla@", text);
            Assert.DoesNotContain("4111", text);
            Assert.DoesNotContain("secret", text);
            Assert.DoesNotContain("/src/src", text);
        }
        Assert.Equal(report.TraceId, stored.TraceId);
        Assert.Equal(report.TraceId[..8].ToUpperInvariant(), stored.ReferenceCode);
        Assert.Equal("Chrome", stored.UserAgentFamily);
        Assert.Equal("1.4.0", stored.AppVersion);
        Assert.Equal("Testing", stored.Environment);
        Assert.Equal(UserRole.Client, stored.ActorRole);
        Assert.Equal("POST api/policies/{id}/pay", group.Endpoint);
    }

    [Fact]
    public async Task Another_endpoint_is_another_group()
    {
        using var fixture = new SqliteTestDb();
        await Recorder(fixture).RecordAsync([Backend(T0), Backend(T0, endpoint: "POST api/claims/{id}/pay")]);
        await using var db = fixture.NewContext();
        Assert.Equal(2, await db.ErrorGroups.CountAsync());
    }

    [Fact]
    public async Task A_resolved_group_reopens_as_regressed_when_it_occurs_again()
    {
        using var fixture = new SqliteTestDb();
        await Recorder(fixture).RecordAsync([Backend(T0)]);
        await using (var db = fixture.NewContext())
        {
            var group = await db.ErrorGroups.SingleAsync();
            group.Resolve(new TestData(db).User(UserRole.Admin).Id, T0.AddMinutes(1), "Fixed");
            await db.SaveChangesAsync();
        }

        await Recorder(fixture).RecordAsync([Backend(T0.AddMinutes(5))]);

        await using var check = fixture.NewContext();
        var reopened = await check.ErrorGroups.SingleAsync();
        Assert.Equal(ErrorStatus.New, reopened.Status);
        Assert.True(reopened.IsRegressed);
        Assert.Equal(2, reopened.OccurrenceCount);
    }

    [Fact]
    public async Task Client_reports_with_the_same_message_template_and_route_are_one_group()
    {
        using var fixture = new SqliteTestDb();
        await Recorder(fixture).RecordAsync([
            Frontend(T0, "Cannot read properties of undefined (reading 'name')"),
            Frontend(T0.AddSeconds(1), "Cannot read properties of undefined (reading 'email')"),
            Frontend(T0.AddSeconds(2), "Cannot read properties of undefined (reading 'name')", route: "/app/policies/:id"),
        ]);

        await using var db = fixture.NewContext();
        Assert.Equal(2, await db.ErrorGroups.CountAsync());
        var stored = await db.ErrorOccurrences.FirstAsync();
        Assert.Equal("Firefox", stored.UserAgentFamily);
        Assert.Equal("2.0.1", stored.AppVersion);
    }

    // The browser reporting the 500 the server already recorded adds nothing.
    [Fact]
    public async Task A_client_echo_of_a_stored_trace_id_is_ignored()
    {
        using var fixture = new SqliteTestDb();
        var server = Backend(T0);
        await Recorder(fixture).RecordAsync([server]);

        await Recorder(fixture).RecordAsync([Frontend(T0.AddSeconds(1), "Request failed with 500", traceId: server.TraceId)]);

        await using var db = fixture.NewContext();
        Assert.Equal(1, await db.ErrorGroups.CountAsync());
        Assert.Equal(1, await db.ErrorOccurrences.CountAsync());
    }

    // Distinct client messages are cheap to invent: past the hourly budget
    // of new groups they fold into one overflow group.
    [Fact]
    public async Task New_client_groups_are_capped_per_hour()
    {
        using var fixture = new SqliteTestDb();
        var flood = Enumerable.Range(0, 30)
            .Select(i => Frontend(T0.AddSeconds(i), $"Unique failure kind {(char)('a' + i % 26)}{(char)('a' + i / 26)}"))
            .ToList();

        await Recorder(fixture, maxPerGroup: 3, maxClientGroups: 5).RecordAsync(flood);

        await using var db = fixture.NewContext();
        Assert.Equal(6, await db.ErrorGroups.CountAsync());
        var overflow = await db.ErrorGroups.SingleAsync(g => g.Fingerprint == ErrorRecorder.OverflowFingerprint);
        Assert.Equal(25, overflow.OccurrenceCount);
        Assert.Equal(3, await db.ErrorOccurrences.CountAsync(o => o.ErrorGroupId == overflow.Id));
    }
}
