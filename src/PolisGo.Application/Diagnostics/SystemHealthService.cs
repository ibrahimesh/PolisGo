using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
using PolisGo.Application.Diagnostics.Dtos;

namespace PolisGo.Application.Diagnostics;

public interface ISystemHealthService
{
    Task<SystemHealthResponse> GetAsync(CancellationToken cancellationToken = default);
}

// Read live on every request (the page is for checking now): build and
// environment names, uptime, clocks, the database probe, the error writer's
// queue, error and rate-limit counts, and the audit log's size. No
// configuration values, connection strings or secrets.
public sealed class SystemHealthService(
    IAppInfo app,
    IErrorReportQueue queue,
    IRateLimitMonitor rateLimits,
    IDatabaseProbe probe,
    IApplicationDbContext db,
    TimeProvider clock) : ISystemHealthService
{
    public async Task<SystemHealthResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var database = await probe.ProbeAsync(cancellationToken);

        long errors = 0, serverErrors = 0, auditSize = 0;
        if (database.Reachable)
        {
            var since = ErrorRecorder.HourOf(now).AddHours(-23);
            var counts = await db.ErrorHourlyCounts.AsNoTracking()
                .Where(c => c.HourStartUtc >= since)
                .GroupBy(c => 1)
                .Select(g => new { Count = g.Sum(c => c.Count), Server = g.Sum(c => c.ServerErrorCount) })
                .FirstOrDefaultAsync(cancellationToken);
            errors = counts?.Count ?? 0;
            serverErrors = counts?.Server ?? 0;
            // The audit feed: staff actions and both status histories.
            auditSize = await db.AuditEntries.LongCountAsync(cancellationToken)
                + await db.ClaimStatusHistory.LongCountAsync(cancellationToken)
                + await db.PolicyStatusHistory.LongCountAsync(cancellationToken);
        }

        var baku = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(now, DateTimeKind.Utc), BusinessCalendar.Zone);
        return new SystemHealthResponse(
            app.Version,
            app.Build,
            app.Environment,
            app.StartedAtUtc,
            (long)Math.Max(0, (now - app.StartedAtUtc).TotalSeconds),
            now,
            baku.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture),
            database,
            queue.Depth,
            queue.Dropped,
            errors,
            serverErrors,
            rateLimits.RejectionsInLast24Hours(),
            auditSize);
    }
}

// Old occurrences go, groups and hourly totals stay (counts outlive the
// detail). Run daily by ErrorRetentionService.
public static class ErrorRetention
{
    public static async Task<(int Occurrences, int Counters)> RunAsync(IApplicationDbContext db, DateTime now,
        ErrorTrackingOptions options, CancellationToken cancellationToken = default)
    {
        var occurrencesBefore = now.AddDays(-Math.Max(1, options.OccurrenceRetentionDays));
        var countersBefore = now.AddDays(-Math.Max(1, options.CounterRetentionDays));
        var occurrences = await db.ErrorOccurrences
            .Where(o => o.OccurredAt < occurrencesBefore)
            .ExecuteDeleteAsync(cancellationToken);
        var counters = await db.ErrorHourlyCounts
            .Where(c => c.HourStartUtc < countersBefore)
            .ExecuteDeleteAsync(cancellationToken);
        return (occurrences, counters);
    }
}
