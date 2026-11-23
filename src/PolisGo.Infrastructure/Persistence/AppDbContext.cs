using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence;

public class AppDbContext : DbContext, IApplicationDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<PolicyType> PolicyTypes => Set<PolicyType>();
    public DbSet<Policy> Policies => Set<Policy>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Claim> Claims => Set<Claim>();
    public DbSet<ClaimStatusHistory> ClaimStatusHistory => Set<ClaimStatusHistory>();
    public DbSet<ClaimDocument> ClaimDocuments => Set<ClaimDocument>();
    public DbSet<PolicyStatusHistory> PolicyStatusHistory => Set<PolicyStatusHistory>();
    public DbSet<PolicyReminderRead> PolicyReminderReads => Set<PolicyReminderRead>();
    public DbSet<ClaimUpdateRead> ClaimUpdateReads => Set<ClaimUpdateRead>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

    // SQL Server takes key-range locks, so a check and the write it guards
    // can't interleave with another request's; SQLite serialises writers.
    public Task<IDbContextTransaction> BeginSerializableTransactionAsync(CancellationToken cancellationToken = default) =>
        Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Pick up every IEntityTypeConfiguration in this assembly — keeps the
        // context lean and encourages one file per entity.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
