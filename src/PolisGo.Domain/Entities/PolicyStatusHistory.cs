using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

// One row per status change, written by the Policy's own transition methods
// so no path can change a status without leaving a trace.
public class PolicyStatusHistory
{
    public Guid Id { get; set; }

    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;

    // Null on the first row (issue): nothing came before.
    public PolicyStatus? FromStatus { get; set; }
    public PolicyStatus ToStatus { get; set; }

    // Null for rows backfilled from data that predates this table.
    public Guid? ChangedByUserId { get; set; }

    public DateTime ChangedAt { get; set; }
}
