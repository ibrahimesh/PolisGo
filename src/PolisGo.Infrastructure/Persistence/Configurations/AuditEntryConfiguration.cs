using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> builder)
    {
        builder.HasKey(a => a.Id);

        builder.Property(a => a.Action).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(a => a.SubjectLabel).IsRequired().HasMaxLength(256);
        builder.Property(a => a.FromValue).HasMaxLength(200);
        builder.Property(a => a.ToValue).HasMaxLength(200);

        // The feed sorts by time and filters by actor.
        builder.HasIndex(a => a.OccurredAt);
        builder.HasIndex(a => a.ActorUserId);

        // Restrict: the log outlives nothing it refers to being deleted.
        builder.HasOne(a => a.Actor)
            .WithMany()
            .HasForeignKey(a => a.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
