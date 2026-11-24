using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Application.Common;
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
        // Folded name and email for searches (SearchText); set on save.
        builder.Property<string>(SearchText.KeyProperty).HasMaxLength(SearchText.KeyMaxLength);

        // Customer directory: each sortable column gets an index so ORDER BY
        // + OFFSET/FETCH reads a page instead of sorting the whole table.
        // (Substring search with a leading wildcard can't use an index.)
        builder.HasIndex(c => c.CreatedAt);
        builder.HasIndex(c => c.FullName);
        builder.HasIndex(c => c.Email);

        // Optional 1-to-1 with User: a customer may or may not have a login.
        // SetNull on delete so removing the User account does not cascade and
        // destroy the customer record, which holds historical policy data.
        builder.HasOne(c => c.User)
            .WithOne(u => u.Customer!)
            .HasForeignKey<Customer>(c => c.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        // The agent's directory filters on AgentId. NoAction: SQL Server
        // refuses a second cascade path from Users; agents aren't deleted.
        builder.HasOne(c => c.Agent)
            .WithMany()
            .HasForeignKey(c => c.AgentId)
            .OnDelete(DeleteBehavior.NoAction);
        builder.HasIndex(c => c.AgentId);
    }
}
