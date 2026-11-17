using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ClaimConfiguration : IEntityTypeConfiguration<Claim>
{
    public void Configure(EntityTypeBuilder<Claim> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.ClaimNumber).IsRequired().HasMaxLength(32);
        builder.Property(c => c.Description).IsRequired().HasMaxLength(2000);
        builder.Property(c => c.Status).HasConversion<string>().HasMaxLength(16).IsRequired();

        builder.Property(c => c.ClaimedAmount).HasColumnType("decimal(18,2)");
        builder.Property(c => c.ApprovedAmount).HasColumnType("decimal(18,2)");

        // Portable optimistic concurrency: the entity's domain methods bump
        // RowVersion on every state change (see Claim.TransitionTo). Guid
        // instead of byte[] gives us value equality in the change tracker and
        // avoids provider-specific rowversion / timestamp columns.
        builder.Property(c => c.RowVersion).IsConcurrencyToken();

        builder.HasIndex(c => c.ClaimNumber).IsUnique();

        // Admin stats: GROUP BY Status, and the monthly window on CreatedAt.
        builder.HasIndex(c => c.Status);
        builder.HasIndex(c => c.CreatedAt);

        // Restrict: claims hold legal/accounting weight; a policy owner must
        // resolve open claims before the policy is purgeable.
        builder.HasOne(c => c.Policy)
            .WithMany(p => p.Claims)
            .HasForeignKey(c => c.PolicyId)
            .OnDelete(DeleteBehavior.Restrict);

        // Adjuster assignment is optional; keep claim if the adjuster is removed.
        builder.HasOne(c => c.AssignedAdjuster)
            .WithMany(u => u.AssignedClaims)
            .HasForeignKey(c => c.AssignedAdjusterId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
