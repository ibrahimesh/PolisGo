using Microsoft.Extensions.Caching.Memory;
using PolisGo.Application.Statistics;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Statistics;

public class AdminStatsServiceTests : IDisposable
{
    // Mid-month "now" so month arithmetic around it is unambiguous.
    private static readonly DateTimeOffset Now = new(2026, 11, 17, 12, 0, 0, TimeSpan.Zero);

    private readonly SqliteTestDb _testDb = new();
    private readonly MemoryCache _cache = new(new MemoryCacheOptions());
    private readonly FakeClock _clock = new(Now);

    public void Dispose()
    {
        _cache.Dispose();
        _testDb.Dispose();
    }

    private AdminStatsService NewSut() => new(_testDb.NewContext(), _cache, _clock);

    [Fact]
    public async Task Empty_database_returns_zero_filled_snapshot()
    {
        var stats = await NewSut().GetAsync();

        Assert.Equal(Now.UtcDateTime, stats.GeneratedAt);
        Assert.Equal("AZN", stats.Currency);
        Assert.Equal(0, stats.TotalCustomers);
        Assert.Equal(0, stats.Policies.Total);
        Assert.Equal(Enum.GetValues<PolicyStatus>(), stats.Policies.ByStatus.Select(s => s.Status));
        Assert.All(stats.Policies.ByStatus, s => Assert.Equal(0, s.Count));
        Assert.Equal(Enum.GetValues<ClaimStatus>(), stats.Claims.ByStatus.Select(s => s.Status));
        Assert.Equal(0m, stats.Policies.PremiumWritten);
        Assert.Equal(0m, stats.Claims.PaidAmount);
        Assert.Equal(0, stats.Claims.ResolvedCount);
        Assert.Null(stats.Claims.AverageResolutionHours);
        Assert.Equal(12, stats.Monthly.Count);
        Assert.All(stats.Monthly, m => Assert.Equal((0, 0), (m.NewPolicies, m.NewClaims)));
    }

    // Nothing stores Expired: an Active policy past its end date reads as
    // Expired everywhere, the stats included (Policy.StatusOn).
    [Fact]
    public async Task An_active_policy_past_its_end_date_counts_as_expired()
    {
        var data = new TestData(_testDb.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        data.Policy(customer, vehicle, PolicyStatus.Active, createdAt: Now.UtcDateTime.AddYears(-3));
        data.Policy(customer, vehicle, PolicyStatus.Active, createdAt: Now.UtcDateTime.AddDays(-10));

        var stats = await NewSut().GetAsync();

        Assert.Equal(1, stats.Policies.ByStatus.Single(s => s.Status == PolicyStatus.Active).Count);
        Assert.Equal(1, stats.Policies.ByStatus.Single(s => s.Status == PolicyStatus.Expired).Count);
        Assert.Equal(2, stats.Policies.Total);
    }

    [Fact]
    public async Task Counts_policies_and_claims_by_status()
    {
        var data = new TestData(_testDb.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        data.Policy(customer, vehicle, PolicyStatus.Draft);
        data.Policy(customer, vehicle, PolicyStatus.Active);
        var active = data.Policy(customer, vehicle, PolicyStatus.Active);
        data.Policy(customer, vehicle, PolicyStatus.Cancelled);
        data.Claim(active, ClaimStatus.Submitted);
        data.Claim(active, ClaimStatus.Rejected);
        data.Claim(active, ClaimStatus.Rejected);

        var stats = await NewSut().GetAsync();

        Assert.Equal(1, stats.TotalCustomers);
        Assert.Equal(4, stats.Policies.Total);
        Assert.Equal(
            new[] { 1, 2, 0, 1 },
            stats.Policies.ByStatus.Select(s => s.Count)); // Draft, Active, Expired, Cancelled
        Assert.Equal(3, stats.Claims.Total);
        Assert.Equal(1, stats.Claims.ByStatus.Single(s => s.Status == ClaimStatus.Submitted).Count);
        Assert.Equal(2, stats.Claims.ByStatus.Single(s => s.Status == ClaimStatus.Rejected).Count);
        Assert.Equal(0, stats.Claims.ByStatus.Single(s => s.Status == ClaimStatus.Paid).Count);
    }

    [Fact]
    public async Task Premium_written_sums_only_completed_payments_and_paid_amount_only_paid_claims()
    {
        var data = new TestData(_testDb.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        var a = data.Policy(customer, vehicle);
        var b = data.Policy(customer, vehicle);
        data.Payment(a, 120.50m);
        data.Payment(b, 79.25m);
        data.Payment(b, 300m, PaymentStatus.Failed);
        data.Payment(b, 50m, PaymentStatus.Refunded);
        data.Claim(a, ClaimStatus.Paid, approved: 400m);
        data.Claim(a, ClaimStatus.Paid, approved: 150.75m);
        data.Claim(a, ClaimStatus.Approved, approved: 999m); // decided, not yet paid out

        var stats = await NewSut().GetAsync();

        Assert.Equal(199.75m, stats.Policies.PremiumWritten);
        Assert.Equal(550.75m, stats.Claims.PaidAmount);
    }

    [Fact]
    public async Task Monthly_activity_covers_the_last_12_months_oldest_first()
    {
        var data = new TestData(_testDb.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        var now = Now.UtcDateTime;
        var current = data.Policy(customer, vehicle, createdAt: now.AddDays(-1));
        data.Policy(customer, vehicle, createdAt: now.AddDays(-2));
        data.Policy(customer, vehicle, createdAt: new DateTime(2025, 12, 1, 0, 0, 0, DateTimeKind.Utc)); // first day of window
        data.Policy(customer, vehicle, createdAt: new DateTime(2025, 11, 30, 23, 59, 0, DateTimeKind.Utc)); // just outside
        data.Claim(current, createdAt: new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc));

        var stats = await NewSut().GetAsync();

        Assert.Equal(12, stats.Monthly.Count);
        Assert.Equal((2025, 12), (stats.Monthly[0].Year, stats.Monthly[0].Month));
        Assert.Equal((2026, 11), (stats.Monthly[^1].Year, stats.Monthly[^1].Month));
        Assert.Equal(1, stats.Monthly[0].NewPolicies);
        Assert.Equal(2, stats.Monthly[^1].NewPolicies);
        Assert.Equal(1, stats.Monthly.Single(m => (m.Year, m.Month) == (2026, 3)).NewClaims);
        Assert.Equal(3, stats.Monthly.Sum(m => m.NewPolicies)); // November 2025 excluded
    }

    [Fact]
    public async Task Average_resolution_uses_first_decision_per_claim()
    {
        var data = new TestData(_testDb.Db);
        var adjuster = data.User(UserRole.Adjuster);
        var customer = data.Customer();
        var policy = data.Policy(customer, data.Vehicle(customer.Id));
        var t0 = new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc);

        // Decided after 10h (approved), then paid two days later: payout doesn't count.
        data.Claim(policy, ClaimStatus.Paid, createdAt: t0, approved: 100m, history:
        [
            (ClaimStatus.UnderReview, t0.AddHours(1), adjuster.Id),
            (ClaimStatus.Approved, t0.AddHours(10), adjuster.Id),
            (ClaimStatus.Paid, t0.AddDays(2), adjuster.Id)
        ]);
        // Rejected after 30h 30m, across a month boundary.
        var t1 = new DateTime(2026, 10, 31, 20, 0, 0, DateTimeKind.Utc);
        data.Claim(policy, ClaimStatus.Rejected, createdAt: t1, history:
        [
            (ClaimStatus.UnderReview, t1.AddHours(2), adjuster.Id),
            (ClaimStatus.Rejected, t1.AddHours(30.5), adjuster.Id)
        ]);
        // Still under review: not resolved, must not affect the average.
        data.Claim(policy, ClaimStatus.UnderReview, createdAt: t0, history:
            [(ClaimStatus.UnderReview, t0.AddHours(3), adjuster.Id)]);

        var stats = await NewSut().GetAsync();

        Assert.Equal(2, stats.Claims.ResolvedCount);
        Assert.Equal(20.25, stats.Claims.AverageResolutionHours); // (10 + 30.5) / 2
    }

    [Fact]
    public async Task Snapshot_is_cached_for_the_ttl_then_recomputed()
    {
        var data = new TestData(_testDb.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        data.Policy(customer, vehicle);

        var first = await NewSut().GetAsync();
        data.Policy(customer, vehicle);

        _clock.Now = Now + AdminStatsService.CacheTtl - TimeSpan.FromSeconds(1);
        var cached = await NewSut().GetAsync();
        Assert.Same(first, cached);
        Assert.Equal(1, cached.Policies.Total);

        _clock.Now = Now + AdminStatsService.CacheTtl;
        var fresh = await NewSut().GetAsync();
        Assert.Equal(2, fresh.Policies.Total);
        Assert.Equal(_clock.Now.UtcDateTime, fresh.GeneratedAt);
    }
}
