using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using M = PolisGo.Application.Diagnostics.ErrorTrackingValidation.Messages;

namespace PolisGo.Application.Diagnostics;

public interface IErrorTrackingService
{
    Task<PagedResult<ErrorGroupRow>> ListAsync(ErrorListQuery query, CancellationToken cancellationToken = default);
    Task<ErrorGroupDetail> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ErrorGroupDetail> UpdateStatusAsync(Guid id, UpdateErrorStatusRequest request, CancellationToken cancellationToken = default);
    Task<ErrorLookupResponse> LookupAsync(string reference, CancellationToken cancellationToken = default);
    Task<PurgeResolvedResponse> PurgeResolvedAsync(int olderThanDays, CancellationToken cancellationToken = default);
    Task<ErrorSummaryResponse> SummaryAsync(CancellationToken cancellationToken = default);
}

// The System section's error views and triage (Admin only, by the
// controller). Status changes go through the entity, carry the caller's
// RowVersion, and are audited in the same SaveChanges like any staff action.
public sealed class ErrorTrackingService : IErrorTrackingService
{
    private const int MaxPageSize = 50;
    private const int RecentOccurrences = 20;

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _clock;

    public ErrorTrackingService(IApplicationDbContext db, ICurrentUser currentUser, TimeProvider clock)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<PagedResult<ErrorGroupRow>> ListAsync(ErrorListQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Clamp(query.Page, 1, 200);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);
        AdminValidation.EnsureInRange(query.From, query.To);
        if (query.From is { } f && query.To is { } t && f > t)
        {
            throw new ValidationException("from", AdminValidation.Messages.RangeOrder);
        }

        var groups = _db.ErrorGroups.AsNoTracking().AsQueryable();
        if (query.Source is { } source) groups = groups.Where(g => g.Source == source);
        if (query.Status is { } status) groups = groups.Where(g => g.Status == status);
        if (query.Regressed is { } regressed) groups = groups.Where(g => g.IsRegressed == regressed);
        if (query.From is { } fromDay)
        {
            var from = BusinessCalendar.StartOfDayUtc(fromDay);
            groups = groups.Where(g => g.LastSeenAt >= from);
        }
        if (query.To is { } toDay)
        {
            var before = BusinessCalendar.StartOfDayUtc(toDay.AddDays(1));
            groups = groups.Where(g => g.LastSeenAt < before);
        }
        if (query.HttpStatus is { } code)
        {
            groups = groups.Where(g => g.LastHttpStatus == code || g.Occurrences.Any(o => o.HttpStatus == code));
        }
        if (query.Role is { } role) groups = groups.Where(g => g.Occurrences.Any(o => o.ActorRole == role));
        if (Text(query.Endpoint) is { } endpoint)
        {
            // Route templates are ASCII with mixed case ("{claimId}"): lower() is exact for ASCII.
            groups = groups.Where(g => g.Endpoint.ToLower().Contains(endpoint));
        }
        if (Text(query.Search) is { } search)
        {
            var (code8, traceId) = ErrorReference.Parse(query.Search);
            // Titles carry the message, which a browser may write in the
            // user's language: the folded key (SearchText) covers title, type
            // and endpoint. A Reference matches exactly.
            groups = groups.Where(g => EF.Property<string>(g, SearchText.KeyProperty).Contains(search)
                || (code8 != null && g.Occurrences.Any(o => o.ReferenceCode == code8))
                || (traceId != null && g.Occurrences.Any(o => o.TraceId == traceId)));
        }

        var total = await groups.CountAsync(cancellationToken);
        var ordered = query.Sort switch
        {
            ErrorSort.Count => groups.OrderByDescending(g => g.OccurrenceCount).ThenByDescending(g => g.LastSeenAt),
            ErrorSort.FirstSeen => groups.OrderByDescending(g => g.FirstSeenAt),
            _ => groups.OrderByDescending(g => g.LastSeenAt)
        };
        var items = await ordered.ThenBy(g => g.Id)
            .Skip(Paging.Skip(page, pageSize)).Take(pageSize)
            .Select(Row)
            .ToListAsync(cancellationToken);
        return new PagedResult<ErrorGroupRow>(items, page, pageSize, total);
    }

    public async Task<ErrorGroupDetail> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var group = await _db.ErrorGroups.AsNoTracking()
            .Where(g => g.Id == id)
            .Select(g => new
            {
                Group = g,
                ResolvedByName = g.ResolvedBy == null ? null : g.ResolvedBy.FullName,
                Stored = g.Occurrences.Count()
            })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Error", id);
        var occurrences = await _db.ErrorOccurrences.AsNoTracking()
            .Where(o => o.ErrorGroupId == id)
            .OrderByDescending(o => o.OccurredAt).ThenBy(o => o.Id)
            .Take(RecentOccurrences)
            .Select(Occurrence)
            .ToListAsync(cancellationToken);

        var g = group.Group;
        return new ErrorGroupDetail(g.Id, g.Fingerprint, g.Title, g.Source, g.ExceptionType, g.Endpoint,
            g.OccurrenceCount, group.Stored, g.FirstSeenAt, g.LastSeenAt, g.LastHttpStatus, g.Status, g.IsRegressed,
            g.RegressedAt, group.ResolvedByName, g.ResolvedAt, g.Note, g.RowVersion, occurrences);
    }

    public async Task<ErrorGroupDetail> UpdateStatusAsync(Guid id, UpdateErrorStatusRequest request,
        CancellationToken cancellationToken = default)
    {
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is { Length: > ErrorTrackingValidation.NoteMaxLength })
        {
            throw new ValidationException("note", M.NoteTooLong);
        }
        var group = await _db.ErrorGroups.SingleOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new NotFoundException("Error", id);
        // The caller decided on what they saw; if it changed since (another
        // admin, or the error came back), they decide again.
        if (group.RowVersion != request.RowVersion) throw new ConcurrencyConflictException();

        var from = group.Status;
        var now = _clock.GetUtcNow().UtcDateTime;
        var by = _currentUser.UserId;
        AuditAction action;
        switch (request.Status)
        {
            case ErrorStatus.Resolved:
                group.Resolve(by, now, note);
                action = AuditAction.ErrorResolved;
                break;
            case ErrorStatus.Ignored:
                group.Ignore(by, now, note);
                action = AuditAction.ErrorIgnored;
                break;
            default:
                group.Reopen(note);
                action = AuditAction.ErrorReopened;
                break;
        }
        _db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(),
            OccurredAt = now,
            ActorUserId = by,
            Action = action,
            SubjectId = group.Id,
            SubjectLabel = Cut(group.Title, 256),
            FromValue = from.ToString(),
            ToValue = group.Status.ToString()
        });
        await _db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ErrorLookupResponse> LookupAsync(string reference, CancellationToken cancellationToken = default)
    {
        var (code, traceId) = ErrorReference.Parse(reference);
        if (code is null) throw new ValidationException("reference", M.ReferenceInvalid);

        var matches = _db.ErrorOccurrences.AsNoTracking()
            .Where(o => traceId != null ? o.TraceId == traceId : o.ReferenceCode == code);
        var count = await matches.CountAsync(cancellationToken);
        var found = await matches
            .OrderByDescending(o => o.OccurredAt).ThenBy(o => o.Id)
            .Select(o => new { o.ErrorGroupId, Occurrence = new ErrorOccurrenceResponse(o.Id, o.OccurredAt, o.TraceId,
                o.ReferenceCode, o.HttpStatus, o.HttpMethod, o.RouteTemplate, o.ActorRole, o.ActorUserId, o.AppVersion,
                o.Environment, o.Message, o.StackTrace, o.UserAgentFamily, o.ClientRoute) })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(M.ReferenceNotFound);
        var group = await _db.ErrorGroups.AsNoTracking()
            .Where(g => g.Id == found.ErrorGroupId)
            .Select(Row)
            .SingleAsync(cancellationToken);
        return new ErrorLookupResponse(found.Occurrence, group, count);
    }

    public async Task<PurgeResolvedResponse> PurgeResolvedAsync(int olderThanDays, CancellationToken cancellationToken = default)
    {
        if (olderThanDays is < 1 or > ErrorTrackingValidation.MaxPurgeDays)
        {
            throw new ValidationException("olderThanDays", M.PurgeDaysRange);
        }
        var now = _clock.GetUtcNow().UtcDateTime;
        var cutoff = now.AddDays(-olderThanDays);
        var ids = await _db.ErrorGroups
            .Where(g => g.Status == ErrorStatus.Resolved && g.ResolvedAt < cutoff)
            .Select(g => g.Id)
            .ToListAsync(cancellationToken);
        if (ids.Count == 0) return new PurgeResolvedResponse(0, olderThanDays);

        // The occurrences first (portable: no reliance on the cascade inside
        // a bulk delete), then the groups, then the record of it.
        await _db.ErrorOccurrences.Where(o => ids.Contains(o.ErrorGroupId)).ExecuteDeleteAsync(cancellationToken);
        var deleted = await _db.ErrorGroups.Where(g => ids.Contains(g.Id)).ExecuteDeleteAsync(cancellationToken);
        _db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(),
            OccurredAt = now,
            ActorUserId = _currentUser.UserId,
            Action = AuditAction.ErrorsPurged,
            SubjectId = Guid.Empty,
            SubjectLabel = $"{deleted} resolved errors",
            FromValue = olderThanDays.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ToValue = deleted.ToString(System.Globalization.CultureInfo.InvariantCulture)
        });
        await _db.SaveChangesAsync(cancellationToken);
        return new PurgeResolvedResponse(deleted, olderThanDays);
    }

    public async Task<ErrorSummaryResponse> SummaryAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var thisHour = ErrorRecorder.HourOf(now);
        var dayStart = thisHour.AddHours(-23);
        var today = BusinessCalendar.Today(_clock);
        var weekStart = BusinessCalendar.StartOfDayUtc(today.AddDays(-6));
        var since = dayStart < weekStart ? dayStart : weekStart;

        // Grouped in SQL by hour; the Baku-day buckets are summed from those.
        var hours = await _db.ErrorHourlyCounts.AsNoTracking()
            .Where(c => c.HourStartUtc >= since)
            .GroupBy(c => c.HourStartUtc)
            .Select(g => new { Hour = g.Key, Count = g.Sum(c => c.Count), Server = g.Sum(c => c.ServerErrorCount) })
            .ToListAsync(cancellationToken);

        var lastDay = Enumerable.Range(0, 24).Select(i =>
        {
            var start = dayStart.AddHours(i);
            var row = hours.FirstOrDefault(h => h.Hour == start);
            return new ErrorCountBucket(start, row?.Count ?? 0, row?.Server ?? 0);
        }).ToList();
        var lastWeek = Enumerable.Range(0, 7).Select(i =>
        {
            var day = today.AddDays(i - 6);
            var start = BusinessCalendar.StartOfDayUtc(day);
            var end = BusinessCalendar.StartOfDayUtc(day.AddDays(1));
            var rows = hours.Where(h => h.Hour >= start && h.Hour < end).ToList();
            return new ErrorCountBucket(start, rows.Sum(h => h.Count), rows.Sum(h => h.Server));
        }).ToList();

        var recent = now.AddHours(-24);
        var top = await _db.ErrorGroups.AsNoTracking()
            .Where(g => g.LastSeenAt >= recent && g.Status != ErrorStatus.Ignored)
            .OrderByDescending(g => g.OccurrenceCount).ThenByDescending(g => g.LastSeenAt).ThenBy(g => g.Id)
            .Take(5)
            .Select(Row)
            .ToListAsync(cancellationToken);
        var open = await _db.ErrorGroups.AsNoTracking()
            .GroupBy(g => 1)
            .Select(g => new
            {
                Unresolved = g.Count(x => x.Status == ErrorStatus.New),
                Regressed = g.Count(x => x.IsRegressed)
            })
            .FirstOrDefaultAsync(cancellationToken);

        return new ErrorSummaryResponse(now, lastDay, lastWeek, top, open?.Unresolved ?? 0, open?.Regressed ?? 0);
    }

    private static readonly System.Linq.Expressions.Expression<Func<ErrorGroup, ErrorGroupRow>> Row = g =>
        new ErrorGroupRow(g.Id, g.Title, g.Source, g.ExceptionType, g.Endpoint, g.OccurrenceCount, g.FirstSeenAt,
            g.LastSeenAt, g.LastHttpStatus, g.Status, g.IsRegressed, g.RowVersion);

    private static readonly System.Linq.Expressions.Expression<Func<ErrorOccurrence, ErrorOccurrenceResponse>> Occurrence = o =>
        new ErrorOccurrenceResponse(o.Id, o.OccurredAt, o.TraceId, o.ReferenceCode, o.HttpStatus, o.HttpMethod,
            o.RouteTemplate, o.ActorRole, o.ActorUserId, o.AppVersion, o.Environment, o.Message, o.StackTrace,
            o.UserAgentFamily, o.ClientRoute);

    private static string? Text(string? value)
    {
        var term = value?.Trim();
        if (string.IsNullOrEmpty(term)) return null;
        if (term.Length > AdminValidation.MaxSearchLength)
        {
            throw new ValidationException("search", AdminValidation.Messages.SearchTooLong);
        }
        return SearchText.Fold(term);
    }

    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];
}
