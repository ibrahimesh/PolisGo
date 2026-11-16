using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Infrastructure.Persistence;

// Development-only seeding. Runs at startup to guarantee at least one Admin
// account exists for provisioning staff accounts via the API.
public static class DatabaseSeeder
{
    public static async Task SeedDevelopmentAsync(
        AppDbContext db,
        IConfiguration configuration,
        IPasswordHasher passwordHasher,
        CancellationToken cancellationToken = default)
    {
        var adminEmail = configuration["Seed:AdminEmail"];
        var adminPassword = configuration["Seed:AdminPassword"];

        // Silent no-op when credentials are absent — developer opted out by
        // not setting the user-secrets. Avoids forcing every contributor to
        // configure a seed.
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
        {
            return;
        }

        var normalisedEmail = adminEmail.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Email == normalisedEmail, cancellationToken))
        {
            return;
        }

        db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = normalisedEmail,
            PasswordHash = passwordHasher.Hash(adminPassword),
            FullName = "PolisGo Admin",
            Role = UserRole.Admin,
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync(cancellationToken);
    }
}
