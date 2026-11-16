using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class VehicleConfiguration : IEntityTypeConfiguration<Vehicle>
{
    public void Configure(EntityTypeBuilder<Vehicle> builder)
    {
        builder.HasKey(v => v.Id);

        builder.Property(v => v.Make).IsRequired().HasMaxLength(64);
        builder.Property(v => v.Model).IsRequired().HasMaxLength(64);
        builder.Property(v => v.PlateNumber).IsRequired().HasMaxLength(16);
        builder.Property(v => v.Vin).IsRequired().HasMaxLength(17);

        // Plate numbers must be unique across the whole registry.
        builder.HasIndex(v => v.PlateNumber).IsUnique();

        // Restrict delete: vehicles are referenced by policies (financial records).
        builder.HasOne(v => v.Customer)
            .WithMany(c => c.Vehicles)
            .HasForeignKey(v => v.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
