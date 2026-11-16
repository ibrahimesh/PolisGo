using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

public class ClaimStatusHistory
{
    public Guid Id { get; set; }

    public Guid ClaimId { get; set; }
    public Claim Claim { get; set; } = null!;

    public ClaimStatus FromStatus { get; set; }
    public ClaimStatus ToStatus { get; set; }

    public Guid ChangedByUserId { get; set; }
    public User ChangedByUser { get; set; } = null!;

    public string Comment { get; set; } = null!;
    public DateTime ChangedAt { get; set; }
}
