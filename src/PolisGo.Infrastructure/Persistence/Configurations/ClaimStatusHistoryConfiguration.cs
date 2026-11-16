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
        builder.Property(h => h.FromStatus).HasConversion<string>().HasMaxLength(16).IsRequired();
        builder.Property(h => h.ToStatus).HasConversion<string>().HasMaxLength(16).IsRequired();

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
