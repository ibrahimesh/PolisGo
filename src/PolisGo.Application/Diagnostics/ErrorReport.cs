using PolisGo.Domain.Enums;

namespace PolisGo.Application.Diagnostics;

// An error as captured, before redaction: it lives only in memory, in the
// queue, until the writer redacts it and stores what is safe to keep.
public sealed record ErrorReport(
    ErrorSource Source,
    DateTime OccurredAt,
    // 32-hex W3C trace id, lower case (ErrorReference.TraceIdOf).
    string TraceId,
    string ExceptionType,
    string Message,
    string? StackTrace,
    // Application frames (backend) or the message template (frontend):
    // what the fingerprint is computed from, beside type and endpoint.
    IReadOnlyList<string> Signature,
    // "POST api/policies/{id}/pay", or the SPA route template.
    string Endpoint,
    int? HttpStatus = null,
    string? HttpMethod = null,
    string? RouteTemplate = null,
    UserRole? ActorRole = null,
    Guid? ActorUserId = null,
    // Reduced to a browser family by the writer; never stored as is.
    string? UserAgent = null,
    string? ClientRoute = null,
    // The SPA's build for client errors; the API's own otherwise.
    string? AppVersion = null);
