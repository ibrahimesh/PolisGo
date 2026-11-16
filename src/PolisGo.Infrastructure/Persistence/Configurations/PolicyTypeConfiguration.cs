using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class PolicyTypeConfiguration : IEntityTypeConfiguration<PolicyType>
{
    // Static seed Ids — HasData needs deterministic keys across migrations.
    public static readonly Guid MtplId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid CascoId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    public void Configure(EntityTypeBuilder<PolicyType> builder)
    {
        builder.HasKey(pt => pt.Id);

        builder.Property(pt => pt.Code).IsRequired().HasMaxLength(16);
        builder.Property(pt => pt.Name).IsRequired().HasMaxLength(100);
        builder.Property(pt => pt.Description).IsRequired().HasMaxLength(500);
        builder.Property(pt => pt.BaseRate).HasColumnType("decimal(18,2)");

        // Code is used as a lookup key by application code and should be unique.
        builder.HasIndex(pt => pt.Code).IsUnique();

        // Seed two baseline Azerbaijani auto-insurance products so the system
        // is usable immediately after a fresh migration.
        builder.HasData(
            new PolicyType
            {
                Id = MtplId,
                Code = "MTPL",
                Name = "Mandatory Third-Party Liability",
                BaseRate = 50.00m,
                Description = "Compulsory auto third-party liability (icbari sigorta)."
            },
            new PolicyType
            {
                Id = CascoId,
                Code = "CASCO",
                Name = "Comprehensive Auto (CASCO)",
                BaseRate = 250.00m,
                Description = "Voluntary own-damage auto insurance."
            }
        );
    }
}
