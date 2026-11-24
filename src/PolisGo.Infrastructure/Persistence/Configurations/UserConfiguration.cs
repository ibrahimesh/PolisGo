using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Application.Common;
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
        // Folded name and email for searches (SearchText); set on save.
        builder.Property<string>(SearchText.KeyProperty).HasMaxLength(SearchText.KeyMaxLength);

        // Enums as strings — readable in SQL tools, resilient to re-ordering values.
        builder.Property(u => u.Role).HasConversion<string>().HasMaxLength(32).IsRequired();

        // Email is the login handle; must be globally unique.
        builder.HasIndex(u => u.Email).IsUnique();

        // Existing rows become active with a fresh stamp (see the migration).
        builder.Property(u => u.IsActive).HasDefaultValue(true);
        // The staff list filters by role and status.
        builder.HasIndex(u => new { u.Role, u.IsActive });
    }
}
