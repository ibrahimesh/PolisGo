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

        builder.HasIndex(c => c.ClaimNumber).IsUnique();

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
