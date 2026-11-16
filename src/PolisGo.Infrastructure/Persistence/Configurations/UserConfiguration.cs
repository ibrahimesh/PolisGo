using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);

        builder.Property(u => u.Email).IsRequired().HasMaxLength(256);
        builder.Property(u => u.PasswordHash).IsRequired().HasMaxLength(512);
        builder.Property(u => u.FullName).IsRequired().HasMaxLength(200);

        // Enums as strings — readable in SQL tools, resilient to re-ordering values.
        builder.Property(u => u.Role).HasConversion<string>().HasMaxLength(32).IsRequired();

        // Email is the login handle; must be globally unique.
        builder.HasIndex(u => u.Email).IsUnique();
    }
}
