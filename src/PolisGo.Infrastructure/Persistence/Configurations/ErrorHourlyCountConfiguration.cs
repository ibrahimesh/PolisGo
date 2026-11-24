using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ErrorHourlyCountConfiguration : IEntityTypeConfiguration<ErrorHourlyCount>
{
    public void Configure(EntityTypeBuilder<ErrorHourlyCount> builder)
    {
        // One row per hour and source; the key is also the range index.
        builder.HasKey(c => new { c.HourStartUtc, c.Source });
        builder.Property(c => c.Source).HasConversion<string>().HasMaxLength(16);
    }
}
