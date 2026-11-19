using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

// One staff action. Written in the same SaveChanges as the change itself, so
// an action can't happen without its record.
public class AuditEntry
{
    public Guid Id { get; set; }
    public DateTime OccurredAt { get; set; }

    public Guid ActorUserId { get; set; }
    public User Actor { get; set; } = null!;

    public AuditAction Action { get; set; }

    // The user or customer acted on, and how it read at the time (an email,
    // a customer's name), so the log stays readable if the record changes.
    public Guid SubjectId { get; set; }
    public string SubjectLabel { get; set; } = null!;

    // e.g. "Agent" -> "Adjuster", or the agent's name on an assignment.
    public string? FromValue { get; set; }
    public string? ToValue { get; set; }
}
