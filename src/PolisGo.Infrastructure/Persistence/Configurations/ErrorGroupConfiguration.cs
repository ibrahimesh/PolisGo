using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PolisGo.Application.Common;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence.Configurations;

public class ErrorGroupConfiguration : IEntityTypeConfiguration<ErrorGroup>
{
    public const int TitleMaxLength = 300;
    public const int TypeMaxLength = 200;
    public const int EndpointMaxLength = 300;
    public const int NoteMaxLength = 1000;

    public void Configure(EntityTypeBuilder<ErrorGroup> builder)
    {
        builder.HasKey(g => g.Id);

        builder.Property(g => g.Fingerprint).IsRequired().HasMaxLength(64).IsUnicode(false);
        builder.Property(g => g.Source).HasConversion<string>().HasMaxLength(16).IsRequired();
        builder.Property(g => g.Title).IsRequired().HasMaxLength(TitleMaxLength);
        builder.Property(g => g.ExceptionType).IsRequired().HasMaxLength(TypeMaxLength);
        builder.Property(g => g.Endpoint).IsRequired().HasMaxLength(EndpointMaxLength);
        builder.Property(g => g.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
        builder.Property(g => g.Note).HasMaxLength(NoteMaxLength);
        builder.Property(g => g.RowVersion).IsConcurrencyToken();
        // Folded title, type and endpoint for the list's search (SearchText);
        // set on save. Not indexed: a contains-search can't seek.
        builder.Property<string>(SearchText.KeyProperty).HasMaxLength(SearchText.KeyMaxLength);

        // The writer finds a group by its fingerprint; one bug, one row.
        builder.HasIndex(g => g.Fingerprint).IsUnique();
        // The list sorts by last seen and filters by status (and regression).
        builder.HasIndex(g => g.LastSeenAt);
        builder.HasIndex(g => new { g.Status, g.IsRegressed });

        // NoAction: users aren't deleted, and SQL Server refuses a second
        // cascade path from Users.
        builder.HasOne(g => g.ResolvedBy)
            .WithMany()
            .HasForeignKey(g => g.ResolvedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
