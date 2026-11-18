using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class PolicyReminderReadConfiguration : IEntityTypeConfiguration<PolicyReminderRead>
{
    public void Configure(EntityTypeBuilder<PolicyReminderRead> builder)
    {
        builder.HasKey(r => r.Id);

        // One read mark per user and policy; also the lookup the reminder
        // query does for every candidate policy.
        builder.HasIndex(r => new { r.PolicyId, r.UserId }).IsUnique();

        builder.HasOne(r => r.Policy)
            .WithMany()
            .HasForeignKey(r => r.PolicyId)
            .OnDelete(DeleteBehavior.Cascade);

        // NO ACTION: Users already reach this table via Policies.AgentId
        // (SET NULL) and SQL Server rejects a second cascade path.
        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
