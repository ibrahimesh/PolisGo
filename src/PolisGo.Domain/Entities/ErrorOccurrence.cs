using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

// One stored event of an ErrorGroup. Everything here is redacted before it
// is saved: no emails, tokens, secrets, query strings or request bodies,
// and the actor only as a role and an id.
public class ErrorOccurrence
{
    public Guid Id { get; set; }
    public Guid ErrorGroupId { get; set; }
    public ErrorGroup Group { get; set; } = null!;

    public DateTime OccurredAt { get; set; }

    // The 32-hex W3C trace id, lower case; ReferenceCode is its first 8
    // characters upper-cased, the "Reference" people quote.
    public string TraceId { get; set; } = null!;
    public string ReferenceCode { get; set; } = null!;

    public int? HttpStatus { get; set; }
    public string? HttpMethod { get; set; }
    // The matched route template ("api/claims/{id}/pay"), never the URL.
    public string? RouteTemplate { get; set; }

    public UserRole? ActorRole { get; set; }
    public Guid? ActorUserId { get; set; }

    public string? AppVersion { get; set; }
    public string? Environment { get; set; }

    public string Message { get; set; } = null!;
    public string? StackTrace { get; set; }

    // "Chrome", "Firefox", ... never the full user agent string.
    public string? UserAgentFamily { get; set; }
    // The SPA route template a client error happened on ("/app/claims/:id").
    public string? ClientRoute { get; set; }
}
