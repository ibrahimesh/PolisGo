using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.FullName).IsRequired().HasMaxLength(200);
        builder.Property(c => c.Email).IsRequired().HasMaxLength(256);
        builder.Property(c => c.Phone).IsRequired().HasMaxLength(32);

        // Optional 1-to-1 with User: a customer may or may not have a login.
        // SetNull on delete so removing the User account does not cascade and
        // destroy the customer record, which holds historical policy data.
        builder.HasOne(c => c.User)
            .WithOne(u => u.Customer!)
            .HasForeignKey<Customer>(c => c.UserId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
