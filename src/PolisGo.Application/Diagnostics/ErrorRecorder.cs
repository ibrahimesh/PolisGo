using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Diagnostics;

public interface IErrorRecorder
{
    Task RecordAsync(IReadOnlyList<ErrorReport> batch, CancellationToken cancellationToken = default);
}

// Stores a batch of captured errors (the background writer's only job):
// redacts them, groups them by fingerprint, counts every one on its group,
// keeps the newest few occurrences per group and the hourly totals. A fixed
// number of queries per batch, whatever its size.
public sealed class ErrorRecorder : IErrorRecorder
{
    // Where client errors go once the hour's budget of new groups is spent.
    public const string OverflowFingerprint = "frontend-overflow";

    private const int TitleMaxLength = 300;
    private const int TypeMaxLength = 200;
    private const int EndpointMaxLength = 300;

    private readonly IApplicationDbContext _db;
    private readonly IAppInfo _app;
    private readonly ErrorTrackingOptions _options;

    public ErrorRecorder(IApplicationDbContext db, IAppInfo app, IOptions<ErrorTrackingOptions> options)
    {
        _db = db;
        _app = app;
        _options = options.Value;
    }

    public async Task RecordAsync(IReadOnlyList<ErrorReport> batch, CancellationToken cancellationToken = default)
    {
        if (batch.Count == 0) return;

        // A client report quoting a trace id the server already stored (the
        // same failed request seen from the browser) adds nothing.
        var clientTraceIds = batch.Where(r => r.Source == ErrorSource.Frontend).Select(r => r.TraceId).Distinct().ToList();
        var known = clientTraceIds.Count == 0
            ? []
            : (await _db.ErrorOccurrences.AsNoTracking()
                .Where(o => clientTraceIds.Contains(o.TraceId))
                .Select(o => o.TraceId)
                .ToListAsync(cancellationToken)).ToHashSet();

        var prepared = batch
            .Where(r => r.Source == ErrorSource.Backend || !known.Contains(r.TraceId))
            .Select(Prepare)
            .ToList();
        if (prepared.Count == 0) return;

        var fingerprints = prepared.Select(p => p.Fingerprint).Append(OverflowFingerprint).Distinct().ToList();
        var groups = await _db.ErrorGroups
            .Where(g => fingerprints.Contains(g.Fingerprint))
            .ToDictionaryAsync(g => g.Fingerprint, cancellationToken);

        var now = prepared.Max(p => p.Report.OccurredAt);
        var hourStart = new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0, DateTimeKind.Utc);
        var newClientGroupsThisHour = await _db.ErrorGroups
            .CountAsync(g => g.Source == ErrorSource.Frontend && g.FirstSeenAt >= hourStart, cancellationToken);

        var touched = new List<ErrorGroup>();
        foreach (var bucket in prepared.GroupBy(p => p.Fingerprint))
        {
            var items = bucket.OrderBy(p => p.Report.OccurredAt).ToList();
            var first = items[0];
            if (!groups.TryGetValue(bucket.Key, out var group))
            {
                if (first.Report.Source == ErrorSource.Frontend && newClientGroupsThisHour >= _options.MaxNewClientGroupsPerHour)
                {
                    group = groups.GetValueOrDefault(OverflowFingerprint) ?? NewOverflowGroup(first.Report.OccurredAt);
                    groups[OverflowFingerprint] = group;
                }
                else
                {
                    group = NewGroup(first);
                    if (group.Source == ErrorSource.Frontend) newClientGroupsThisHour++;
                    groups[bucket.Key] = group;
                }
            }

            var last = items[^1];
            group.Record(items.Count, last.Report.OccurredAt, last.Report.HttpStatus);
            if (!touched.Contains(group)) touched.Add(group);

            // Only the newest few of a burst are worth a row each.
            foreach (var item in items.TakeLast(_options.MaxOccurrencesPerGroup))
            {
                _db.ErrorOccurrences.Add(Occurrence(group.Id, item));
            }
        }

        await CountHoursAsync(prepared, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await TrimAsync(touched.Select(g => g.Id).ToList(), cancellationToken);
    }

    private sealed record Prepared(ErrorReport Report, string Fingerprint, string Message, string? Stack);

    private static Prepared Prepare(ErrorReport report)
    {
        var endpoint = Cut(report.Endpoint, EndpointMaxLength);
        var type = Cut(report.ExceptionType, TypeMaxLength);
        return new Prepared(
            report,
            ErrorFingerprint.Compute(report.Source, type, report.Signature, endpoint),
            Redaction.Message(report.Message),
            Redaction.Stack(report.StackTrace));
    }

    private ErrorGroup NewGroup(Prepared first)
    {
        var report = first.Report;
        var title = first.Message.Split('\n', 2)[0].Trim();
        var group = new ErrorGroup
        {
            Id = Guid.NewGuid(),
            Fingerprint = first.Fingerprint,
            Source = report.Source,
            Title = Cut(title.Length > 0 ? title : report.ExceptionType, TitleMaxLength),
            ExceptionType = Cut(report.ExceptionType, TypeMaxLength),
            Endpoint = Cut(report.Endpoint, EndpointMaxLength),
            FirstSeenAt = report.OccurredAt,
            LastSeenAt = report.OccurredAt,
            OccurrenceCount = 0
        };
        _db.ErrorGroups.Add(group);
        return group;
    }

    private ErrorGroup NewOverflowGroup(DateTime at)
    {
        var group = new ErrorGroup
        {
            Id = Guid.NewGuid(),
            Fingerprint = OverflowFingerprint,
            Source = ErrorSource.Frontend,
            Title = "Too many distinct client errors in one hour (grouped here)",
            ExceptionType = "Overflow",
            Endpoint = "*",
            FirstSeenAt = at,
            LastSeenAt = at
        };
        _db.ErrorGroups.Add(group);
        return group;
    }

    private ErrorOccurrence Occurrence(Guid groupId, Prepared item)
    {
        var report = item.Report;
        return new ErrorOccurrence
        {
            Id = Guid.NewGuid(),
            ErrorGroupId = groupId,
            OccurredAt = report.OccurredAt,
            TraceId = report.TraceId,
            ReferenceCode = ErrorReference.CodeOf(report.TraceId),
            HttpStatus = report.HttpStatus,
            // A custom verb can be any length; the column holds 10.
            HttpMethod = report.HttpMethod is null ? null : Cut(report.HttpMethod, 10),
            RouteTemplate = report.RouteTemplate is null ? null : Cut(report.RouteTemplate, EndpointMaxLength),
            ActorRole = report.ActorRole,
            ActorUserId = report.ActorUserId,
            AppVersion = Cut(Redaction.Scrub(report.AppVersion ?? _app.Version), 64),
            Environment = Cut(_app.Environment, 64),
            Message = item.Message.Length > 0 ? item.Message : report.ExceptionType,
            StackTrace = item.Stack,
            UserAgentFamily = UserAgentFamily.Of(report.UserAgent),
            ClientRoute = report.ClientRoute is null ? null : Cut(report.ClientRoute, 200)
        };
    }

    private async Task CountHoursAsync(List<Prepared> prepared, CancellationToken cancellationToken)
    {
        var buckets = prepared
            .GroupBy(p => (Hour: HourOf(p.Report.OccurredAt), p.Report.Source))
            .ToList();
        var hours = buckets.Select(b => b.Key.Hour).Distinct().ToList();
        var existing = await _db.ErrorHourlyCounts
            .Where(c => hours.Contains(c.HourStartUtc))
            .ToListAsync(cancellationToken);
        foreach (var bucket in buckets)
        {
            var row = existing.FirstOrDefault(c => c.HourStartUtc == bucket.Key.Hour && c.Source == bucket.Key.Source);
            if (row is null)
            {
                row = new ErrorHourlyCount { HourStartUtc = bucket.Key.Hour, Source = bucket.Key.Source };
                _db.ErrorHourlyCounts.Add(row);
                existing.Add(row);
            }
            row.Count += bucket.Count();
            row.ServerErrorCount += bucket.Count(p => p.Report.HttpStatus >= 500);
        }
    }

    // Keeps the newest MaxOccurrencesPerGroup rows of each group just written.
    private async Task TrimAsync(List<Guid> groupIds, CancellationToken cancellationToken)
    {
        var max = _options.MaxOccurrencesPerGroup;
        var over = await _db.ErrorOccurrences.AsNoTracking()
            .Where(o => groupIds.Contains(o.ErrorGroupId))
            .GroupBy(o => o.ErrorGroupId)
            .Where(g => g.Count() > max)
            .Select(g => g.Key)
            .ToListAsync(cancellationToken);
        foreach (var groupId in over)
        {
            var stale = await _db.ErrorOccurrences.AsNoTracking()
                .Where(o => o.ErrorGroupId == groupId)
                .OrderByDescending(o => o.OccurredAt).ThenByDescending(o => o.Id)
                .Skip(max)
                .Select(o => o.Id)
                .ToListAsync(cancellationToken);
            await _db.ErrorOccurrences.Where(o => stale.Contains(o.Id)).ExecuteDeleteAsync(cancellationToken);
        }
    }

    public static DateTime HourOf(DateTime utc) => new(utc.Year, utc.Month, utc.Day, utc.Hour, 0, 0, DateTimeKind.Utc);

    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];
}
