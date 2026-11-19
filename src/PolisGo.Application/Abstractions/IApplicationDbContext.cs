using Microsoft.EntityFrameworkCore;
using PolisGo.Domain.Entities;

namespace PolisGo.Application.Abstractions;

// Narrow view of the persistence context used by the Application layer.
// Keeps Application coupled to EF Core's abstractions package only — not to
// any provider or to the full concrete DbContext.
public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Customer> Customers { get; }
    DbSet<Vehicle> Vehicles { get; }
    DbSet<PolicyType> PolicyTypes { get; }
    DbSet<Policy> Policies { get; }
    DbSet<Payment> Payments { get; }
    DbSet<Claim> Claims { get; }
    DbSet<ClaimStatusHistory> ClaimStatusHistory { get; }
    DbSet<ClaimDocument> ClaimDocuments { get; }
    DbSet<PolicyStatusHistory> PolicyStatusHistory { get; }
    DbSet<PolicyReminderRead> PolicyReminderReads { get; }
    DbSet<ClaimUpdateRead> ClaimUpdateReads { get; }
    DbSet<AuditEntry> AuditEntries { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
