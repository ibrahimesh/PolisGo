using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ClaimDocumentConfiguration : IEntityTypeConfiguration<ClaimDocument>
{
    public void Configure(EntityTypeBuilder<ClaimDocument> builder)
    {
        builder.HasKey(d => d.Id);

        builder.Property(d => d.FileName).IsRequired().HasMaxLength(256);
        builder.Property(d => d.StoragePath).IsRequired().HasMaxLength(1024);

        // Cascade: when a claim is deleted the document references go with it.
        // The actual blob cleanup is the storage adapter's responsibility.
        builder.HasOne(d => d.Claim)
            .WithMany(c => c.Documents)
            .HasForeignKey(d => d.ClaimId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
