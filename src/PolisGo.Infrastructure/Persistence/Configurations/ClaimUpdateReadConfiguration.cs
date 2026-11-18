using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ClaimUpdateReadConfiguration : IEntityTypeConfiguration<ClaimUpdateRead>
{
    public void Configure(EntityTypeBuilder<ClaimUpdateRead> builder)
    {
        builder.HasKey(r => r.Id);

        // One mark per user and claim; also the lookup the updates query does
        // for every claim.
        builder.HasIndex(r => new { r.ClaimId, r.UserId }).IsUnique();

        builder.HasOne(r => r.Claim)
            .WithMany()
            .HasForeignKey(r => r.ClaimId)
            .OnDelete(DeleteBehavior.Cascade);

        // NO ACTION, as for reminder reads: a second cascade path from Users
        // would be rejected by SQL Server.
        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
