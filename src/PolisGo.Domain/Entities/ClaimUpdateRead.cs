namespace PolisGo.Domain.Entities;

// How far a user has read the status updates of one claim. Updates are not
// stored separately — they are the claim's status history — so an update is
// unread when it is newer than ReadAt.
public class ClaimUpdateRead
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public Guid ClaimId { get; set; }
    public Claim Claim { get; set; } = null!;

    public DateTime ReadAt { get; set; }
}
