using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class PolicyStatusHistoryConfiguration : IEntityTypeConfiguration<PolicyStatusHistory>
{
    public void Configure(EntityTypeBuilder<PolicyStatusHistory> builder)
    {
        builder.HasKey(h => h.Id);

        builder.Property(h => h.FromStatus).HasConversion<string>().HasMaxLength(16).IsRequired(false);
        builder.Property(h => h.ToStatus).HasConversion<string>().HasMaxLength(16).IsRequired();

        // Policy detail reads one policy's rows in order; the client overview
        // reads the newest rows across a customer's policies.
        builder.HasIndex(h => new { h.PolicyId, h.ChangedAt });
        builder.HasIndex(h => h.ChangedAt);

        // The audit trail belongs to the policy.
        builder.HasOne(h => h.Policy)
            .WithMany(p => p.StatusHistory)
            .HasForeignKey(h => h.PolicyId)
            .OnDelete(DeleteBehavior.Cascade);

        // NO ACTION, not SET NULL: Users already reach this table through
        // Policies.AgentId, and SQL Server rejects a second cascade path.
        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(h => h.ChangedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
