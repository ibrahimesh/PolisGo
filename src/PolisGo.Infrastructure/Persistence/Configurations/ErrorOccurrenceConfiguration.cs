using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ErrorOccurrenceConfiguration : IEntityTypeConfiguration<ErrorOccurrence>
{
    public const int MessageMaxLength = 1000;
    public const int StackMaxLength = 8000;

    public void Configure(EntityTypeBuilder<ErrorOccurrence> builder)
    {
        builder.HasKey(o => o.Id);

        builder.Property(o => o.TraceId).IsRequired().HasMaxLength(32).IsUnicode(false);
        builder.Property(o => o.ReferenceCode).IsRequired().HasMaxLength(8).IsUnicode(false);
        builder.Property(o => o.HttpMethod).HasMaxLength(10).IsUnicode(false);
        builder.Property(o => o.RouteTemplate).HasMaxLength(ErrorGroupConfiguration.EndpointMaxLength);
        builder.Property(o => o.ActorRole).HasConversion<string>().HasMaxLength(32);
        builder.Property(o => o.AppVersion).HasMaxLength(64);
        builder.Property(o => o.Environment).HasMaxLength(64);
        builder.Property(o => o.Message).IsRequired().HasMaxLength(MessageMaxLength);
        builder.Property(o => o.StackTrace).HasMaxLength(StackMaxLength);
        builder.Property(o => o.UserAgentFamily).HasMaxLength(40);
        builder.Property(o => o.ClientRoute).HasMaxLength(200);

        // Lookup by the Reference people quote, or by the full trace id.
        builder.HasIndex(o => o.ReferenceCode);
        builder.HasIndex(o => o.TraceId);
        // A group's recent occurrences, newest first; retention by age.
        builder.HasIndex(o => new { o.ErrorGroupId, o.OccurredAt });
        builder.HasIndex(o => o.OccurredAt);

        builder.HasOne(o => o.Group)
            .WithMany(g => g.Occurrences)
            .HasForeignKey(o => o.ErrorGroupId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
