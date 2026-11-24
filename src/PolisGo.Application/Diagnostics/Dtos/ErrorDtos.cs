using PolisGo.Domain.Enums;

namespace PolisGo.Application.Diagnostics.Dtos;

public enum ErrorSort
{
    LastSeen,
    Count,
    FirstSeen
}

public record ErrorListQuery(
    ErrorSource? Source = null,
    ErrorStatus? Status = null,
    // Only groups that came back after being resolved.
    bool? Regressed = null,
    // Last seen on these Baku days, inclusive.
    DateOnly? From = null,
    DateOnly? To = null,
    int? HttpStatus = null,
    // Part of the endpoint or route template.
    string? Endpoint = null,
    // Groups with a stored occurrence by this role.
    UserRole? Role = null,
    // Title, type or endpoint text; or a Reference ("8F05E497", with or
    // without a dash or spaces) or a full trace id.
    string? Search = null,
    ErrorSort Sort = ErrorSort.LastSeen,
    int Page = 1,
    int PageSize = 25);

public record ErrorGroupRow(
    Guid Id,
    string Title,
    ErrorSource Source,
    string ExceptionType,
    string Endpoint,
    long OccurrenceCount,
    DateTime FirstSeenAt,
    DateTime LastSeenAt,
    int? LastHttpStatus,
    ErrorStatus Status,
    bool IsRegressed,
    Guid RowVersion);

public record ErrorOccurrenceResponse(
    Guid Id,
    DateTime OccurredAt,
    string TraceId,
    string ReferenceCode,
    int? HttpStatus,
    string? HttpMethod,
    string? RouteTemplate,
    UserRole? ActorRole,
    Guid? ActorUserId,
    string? AppVersion,
    string? Environment,
    string Message,
    string? StackTrace,
    string? UserAgentFamily,
    string? ClientRoute);

public record ErrorGroupDetail(
    Guid Id,
    string Fingerprint,
    string Title,
    ErrorSource Source,
    string ExceptionType,
    string Endpoint,
    long OccurrenceCount,
    int StoredOccurrenceCount,
    DateTime FirstSeenAt,
    DateTime LastSeenAt,
    int? LastHttpStatus,
    ErrorStatus Status,
    bool IsRegressed,
    DateTime? RegressedAt,
    string? ResolvedByName,
    DateTime? ResolvedAt,
    string? Note,
    Guid RowVersion,
    // Newest first, at most MaxOccurrencesPerGroup.
    IReadOnlyList<ErrorOccurrenceResponse> Occurrences);

public record UpdateErrorStatusRequest(
    // Resolved, Ignored, or New to reopen.
    ErrorStatus Status,
    string? Note,
    // The RowVersion the caller loaded; a stale one is a 409.
    Guid RowVersion);

public record ErrorLookupResponse(
    ErrorOccurrenceResponse Occurrence,
    ErrorGroupRow Group,
    // Occurrences sharing the 8-character code (almost always 1); the newest
    // is returned.
    int Matches);

public record PurgeResolvedResponse(int Deleted, int OlderThanDays);

public record ErrorCountBucket(DateTime Start, long Count, long ServerErrors);

public record ErrorSummaryResponse(
    DateTime GeneratedAt,
    // 24 hourly buckets (UTC hours), oldest first.
    IReadOnlyList<ErrorCountBucket> LastDay,
    // 7 daily buckets (Baku days), oldest first.
    IReadOnlyList<ErrorCountBucket> LastWeek,
    // The most frequent groups seen in the last 24 hours (not ignored).
    IReadOnlyList<ErrorGroupRow> Top,
    int Unresolved,
    int Regressed);

public record DatabaseHealth(
    bool Reachable,
    double? RoundTripMs,
    string? LastAppliedMigration,
    IReadOnlyList<string> PendingMigrations);

public record SystemHealthResponse(
    string Version,
    string Build,
    string Environment,
    DateTime StartedAt,
    long UptimeSeconds,
    DateTime ServerTimeUtc,
    // The same instant in Asia/Baku, as "yyyy-MM-ddTHH:mm:ss".
    string ServerTimeBaku,
    DatabaseHealth Database,
    int QueueDepth,
    long QueueDropped,
    long ErrorsLast24Hours,
    long ServerErrorsLast24Hours,
    long RateLimitRejectionsLast24Hours,
    long AuditLogSize);
