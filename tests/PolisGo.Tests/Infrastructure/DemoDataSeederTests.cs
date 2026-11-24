using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

public class DemoDataSeederTests
{
    private static readonly FakeClock Clock = new(new DateTimeOffset(2026, 11, 20, 12, 0, 0, TimeSpan.Zero));

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value))
            .Build();

    private static Task<DemoSeedResult> Seed(SqliteTestDb fixture, IConfiguration config, string environment = "Development") =>
        DemoDataSeeder.SeedIfEnabledAsync(
            fixture.Db, config, environment, new BcryptPasswordHasher(), new PremiumCalculator(), Clock);

    [Fact]
    public async Task Off_by_default_and_refused_in_production()
    {
        using var fixture = new SqliteTestDb();

        Assert.Equal(DemoSeedResult.Disabled, await Seed(fixture, Config()));
        Assert.Equal(DemoSeedResult.RefusedOutsideDevelopment,
            await Seed(fixture, Config(("Demo:SeedData", "true")), "Production"));
        Assert.False(await fixture.Db.Users.AnyAsync(u => u.Email.EndsWith(DemoDataSeeder.Domain)));
    }

    // An allow-list, not a deny-list: any environment but Development (a
    // "Staging", a misspelt "prod") would get staff accounts sharing a
    // documented password.
    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("prod")]
    public async Task Refused_outside_development(string environment)
    {
        using var fixture = new SqliteTestDb();
        var config = Config(("Demo:SeedData", "true"), ("Demo:Password", "Configured-Passw0rd"));

        var result = await Seed(fixture, config, environment);

        Assert.NotEqual(DemoSeedResult.Seeded, result);
        Assert.False(await fixture.Db.Users.AnyAsync(u => u.Email.EndsWith(DemoDataSeeder.Domain)));
    }

    [Fact]
    public async Task Seeds_a_believable_history_once()
    {
        using var fixture = new SqliteTestDb();
        var config = Config(("Demo:SeedData", "true"), ("Demo:Password", "Configured-Passw0rd"));

        Assert.Equal(DemoSeedResult.Seeded, await Seed(fixture, config));
        var counts = (await fixture.Db.Users.CountAsync(), await fixture.Db.Policies.CountAsync(), await fixture.Db.Claims.CountAsync());
        Assert.Equal(DemoSeedResult.AlreadySeeded, await Seed(fixture, config));
        Assert.Equal(counts, (await fixture.Db.Users.CountAsync(), await fixture.Db.Policies.CountAsync(), await fixture.Db.Claims.CountAsync()));

        // Staff and clients, with the configured password (not the admin's).
        var users = await fixture.Db.Users.ToListAsync();
        Assert.Equal(2, users.Count(u => u.Role == UserRole.Agent));
        Assert.Equal(2, users.Count(u => u.Role == UserRole.Adjuster));
        Assert.Equal(8, users.Count(u => u.Role == UserRole.Client));
        Assert.DoesNotContain(users, u => u.Role == UserRole.Admin);
        Assert.True(new BcryptPasswordHasher().Verify("Configured-Passw0rd", users[0].PasswordHash));

        // Every claim status, each with a history that starts at Submitted
        // and ends at the claim's status, in time order.
        var claims = await fixture.Db.Claims.Include(c => c.StatusHistory).Include(c => c.Policy).ToListAsync();
        Assert.Equal(Enum.GetValues<ClaimStatus>().Order(), claims.Select(c => c.Status).Distinct().Order());
        foreach (var claim in claims)
        {
            var history = claim.StatusHistory.OrderBy(h => h.ChangedAt).ToList();
            Assert.Null(history[0].FromStatus);
            Assert.Equal(claim.Status, history[^1].ToStatus);
            Assert.True(claim.IncidentDate >= claim.Policy.StartDate && claim.IncidentDate <= claim.Policy.EndDate);
            Assert.True(history.All(h => h.ChangedAt <= Clock.Now.UtcDateTime));
            if (claim.Status is ClaimStatus.Approved or ClaimStatus.Paid) Assert.NotNull(claim.ApprovedAmount);
        }

        // Policies started months ago and paid; one expired by now, one draft, one cancelled.
        var policies = await fixture.Db.Policies.Include(p => p.Payments).ToListAsync();
        var today = DateOnly.FromDateTime(Clock.Now.UtcDateTime);
        Assert.Contains(policies, p => p.StartDate < Clock.Now.UtcDateTime.AddMonths(-9));
        Assert.Contains(policies, p => p.StatusOn(today) == PolicyStatus.Expired);
        Assert.Contains(policies, p => p.Status == PolicyStatus.Draft && p.Payments.Count == 0);
        Assert.Contains(policies, p => p.Status == PolicyStatus.Cancelled);
        Assert.All(policies.Where(p => p.Status != PolicyStatus.Draft), p => Assert.Single(p.Payments));
        Assert.Equal(7, await fixture.Db.Customers.CountAsync(c => c.AgentId != null));

        // Error groups for the System section, unmistakably synthetic: every
        // status, a regression, a Reference per stored occurrence, counts in
        // the charts.
        var errors = await fixture.Db.ErrorGroups.Include(g => g.Occurrences).ToListAsync();
        Assert.Equal(4, errors.Count);
        Assert.All(errors, g =>
        {
            Assert.StartsWith("[Demo]", g.Title);
            Assert.StartsWith("demo-", g.Fingerprint);
            Assert.All(g.Occurrences, o =>
            {
                Assert.Equal("Demo", o.Environment);
                Assert.StartsWith("de5000", o.TraceId);
                Assert.Equal(o.TraceId[..8].ToUpperInvariant(), o.ReferenceCode);
                Assert.True(o.OccurredAt <= Clock.Now.UtcDateTime);
            });
        });
        Assert.Equal(Enum.GetValues<ErrorStatus>().Order(), errors.Select(g => g.Status).Distinct().Order());
        Assert.Single(errors, g => g.IsRegressed);
        Assert.Equal(errors.Sum(g => g.OccurrenceCount), await fixture.Db.ErrorHourlyCounts.SumAsync(c => c.Count));
    }

    // No built-in password: demo staff accounts with a password printed in
    // the README would be a usable default secret.
    [Fact]
    public async Task Without_a_configured_password_nothing_is_seeded()
    {
        using var fixture = new SqliteTestDb();

        var result = await Seed(fixture, Config(("Demo:SeedData", "true")));

        Assert.Equal(DemoSeedResult.MissingPassword, result);
        Assert.False(await fixture.Db.Users.AnyAsync(u => u.Email.EndsWith(DemoDataSeeder.Domain)));
    }
}
