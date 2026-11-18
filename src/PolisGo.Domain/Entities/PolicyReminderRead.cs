namespace PolisGo.Domain.Entities;

// A user dismissed the renewal reminder for one policy. Reminders themselves
// are not stored — they are computed from end dates on every read — so this
// row is the only state they need.
public class PolicyReminderRead
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;

    public DateTime ReadAt { get; set; }
}
