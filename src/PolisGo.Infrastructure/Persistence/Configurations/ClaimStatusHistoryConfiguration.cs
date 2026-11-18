using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ClaimStatusHistoryConfiguration : IEntityTypeConfiguration<ClaimStatusHistory>
{
    public void Configure(EntityTypeBuilder<ClaimStatusHistory> builder)
    {
        builder.HasKey(h => h.Id);

        builder.Property(h => h.Comment).IsRequired().HasMaxLength(1000);
        // FromStatus is null only on the first history row (the Submit itself).
        builder.Property(h => h.FromStatus).HasConversion<string>().HasMaxLength(16).IsRequired(false);
        builder.Property(h => h.ToStatus).HasConversion<string>().HasMaxLength(16).IsRequired();

        // Resolution-time stats seek decisions by ToStatus, then group by
        // claim and take MIN(ChangedAt): this index covers the whole lookup.
        builder.HasIndex(h => new { h.ToStatus, h.ClaimId, h.ChangedAt });

        // A claim's timeline and its latest update (notifications) read by
        // claim, newest or oldest first.
        builder.HasIndex(h => new { h.ClaimId, h.ChangedAt });

        // Cascade with the parent claim: audit trail dies with the claim.
        builder.HasOne(h => h.Claim)
            .WithMany(c => c.StatusHistory)
            .HasForeignKey(h => h.ClaimId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict on the user: we must not lose attribution of who made a
        // change if the user account is removed.
        builder.HasOne(h => h.ChangedByUser)
            .WithMany()
            .HasForeignKey(h => h.ChangedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
