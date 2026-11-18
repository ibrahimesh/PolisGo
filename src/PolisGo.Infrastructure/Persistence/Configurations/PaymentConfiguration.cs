using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Amount).HasColumnType("decimal(18,2)");
        builder.Property(p => p.Method).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
        builder.Property(p => p.Reference).HasMaxLength(64);

        // Overview: premiums paid in the last 12 months, per policy.
        builder.HasIndex(p => new { p.PolicyId, p.PaidAt });

        // Cascade: a payment has no meaning without its policy. Deleting the
        // policy aggregate also sweeps its payment rows.
        builder.HasOne(p => p.Policy)
            .WithMany(pol => pol.Payments)
            .HasForeignKey(p => p.PolicyId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
