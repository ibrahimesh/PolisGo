using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

namespace PolisGo.Domain.Entities;

// One bug: every occurrence with the same fingerprint (source, exception
// type, top application frames, endpoint) is counted here, however often it
// happens. Only a capped number of recent occurrences are stored beside it.
public class ErrorGroup
{
    public Guid Id { get; set; }

    // SHA-256, hex. Unique: the writer finds the group by it.
    public string Fingerprint { get; set; } = null!;
    public ErrorSource Source { get; set; }

    // Redacted: the first line of the first message seen, or the type.
    public string Title { get; set; } = null!;
    public string ExceptionType { get; set; } = null!;

    // "POST api/policies/{id}/pay" for the API, "/app/claims/:id" for the SPA:
    // templates only, never a raw URL.
    public string Endpoint { get; set; } = null!;

    public DateTime FirstSeenAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public long OccurrenceCount { get; set; }
    public int? LastHttpStatus { get; set; }

    public ErrorStatus Status { get; set; } = ErrorStatus.New;

    // Resolved, then seen again: reopened by the system, not by a person.
    public bool IsRegressed { get; set; }
    public DateTime? RegressedAt { get; set; }

    // Who last resolved or ignored it, when, and their note.
    public Guid? ResolvedByUserId { get; set; }
    public User? ResolvedBy { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? Note { get; set; }

    // Changes on every status change (by a person or a regression), so an
    // admin acting on a stale view gets a conflict, not a silent overwrite.
    // Counting doesn't change it: a busy error must not block triage.
    public Guid RowVersion { get; set; } = Guid.NewGuid();

    public ICollection<ErrorOccurrence> Occurrences { get; set; } = new List<ErrorOccurrence>();

    // `count` occurrences arrived, the last at `at`. Returns true when this
    // reopened a resolved group (a regression). Ignored groups keep counting.
    public bool Record(int count, DateTime at, int? httpStatus)
    {
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        OccurrenceCount += count;
        if (at > LastSeenAt) LastSeenAt = at;
        if (at < FirstSeenAt) FirstSeenAt = at;
        LastHttpStatus = httpStatus ?? LastHttpStatus;
        if (Status != ErrorStatus.Resolved) return false;

        Status = ErrorStatus.New;
        IsRegressed = true;
        RegressedAt = at;
        RowVersion = Guid.NewGuid();
        return true;
    }

    public void Resolve(Guid by, DateTime at, string? note) => ChangeStatus(ErrorStatus.Resolved, by, at, note);

    public void Ignore(Guid by, DateTime at, string? note) => ChangeStatus(ErrorStatus.Ignored, by, at, note);

    // Back to New by hand: no longer a regression, nobody's resolution.
    public void Reopen(string? note)
    {
        if (Status == ErrorStatus.New)
        {
            throw new InvalidStateTransitionException("This error is already open.");
        }
        Status = ErrorStatus.New;
        IsRegressed = false;
        ResolvedByUserId = null;
        ResolvedAt = null;
        Note = note;
        RowVersion = Guid.NewGuid();
    }

    private void ChangeStatus(ErrorStatus status, Guid by, DateTime at, string? note)
    {
        if (Status == status)
        {
            throw new InvalidStateTransitionException($"This error is already {status.ToString().ToLowerInvariant()}.");
        }
        Status = status;
        IsRegressed = false;
        ResolvedByUserId = by;
        ResolvedAt = at;
        Note = note;
        RowVersion = Guid.NewGuid();
    }
}
