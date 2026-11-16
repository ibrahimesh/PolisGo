using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class PolicyConfiguration : IEntityTypeConfiguration<Policy>
{
    public void Configure(EntityTypeBuilder<Policy> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.PolicyNumber).IsRequired().HasMaxLength(32);
        builder.Property(p => p.Premium).HasColumnType("decimal(18,2)");
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(16).IsRequired();

        builder.HasIndex(p => p.PolicyNumber).IsUnique();

        // Restrict: policies are financial records and must not be lost when a
        // related customer/vehicle/type is removed. The deleter must clean up
        // policies explicitly or archive the referenced record instead.
        builder.HasOne(p => p.Customer)
            .WithMany(c => c.Policies)
            .HasForeignKey(p => p.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(p => p.Vehicle)
            .WithMany(v => v.Policies)
            .HasForeignKey(p => p.VehicleId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(p => p.PolicyType)
            .WithMany(pt => pt.Policies)
            .HasForeignKey(p => p.PolicyTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Agent is optional; deleting an agent should not wipe their sales history.
        builder.HasOne(p => p.Agent)
            .WithMany(u => u.HandledPolicies)
            .HasForeignKey(p => p.AgentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
