using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin;
using PolisGo.Application.Auth;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Policies;
using PolisGo.Application.Pricing;
using PolisGo.Application.Statistics;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.AuditRepro;

// Audit reproductions. Each test asserts the behaviour the code SHOULD have,
// so it fails on the audited commit and documents the defect.
public class AuditReproHttpTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    public AuditReproHttpTests(ApiFactory factory) => _factory = factory;

    private static string Today => DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");

    private (Guid PolicyId, Guid CustomerId) SeedActivePolicy(Guid? agentId = null) => _factory.WithDb(db =>
    {
        var data = new TestData(db);
        var customer = data.Customer(agentId: agentId);
        var vehicle = data.Vehicle(customer.Id);
        var policy = data.Policy(customer, vehicle, PolicyStatus.Active, agentId: agentId);
        return (policy.Id, customer.Id);
    });

    private PolicyStatus StoredStatus(Guid policyId) =>
        _factory.WithDb(db => db.Policies.AsNoTracking().Single(p => p.Id == policyId).Status);

    [Fact]
    public async Task AUD_adjuster_cannot_cancel_a_customers_policy()
    {
        var (policyId, _) = SeedActivePolicy();
        var adjuster = _factory.ClientAs(UserRole.Adjuster);

        var response = await adjuster.PostAsync($"/api/policies/{policyId}/cancel", null);

        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound,
            $"Adjuster cancel returned {(int)response.StatusCode}; stored status now {StoredStatus(policyId)}");
    }

    [Fact]
    public async Task AUD_agent_loses_write_access_when_the_customer_moves_to_another_book()
    {
        var agentA = _factory.ClientAs(UserRole.Agent, out var agentAId, out _);
        var agentB = _factory.ClientAs(UserRole.Agent, out var agentBId, out _);
        var (policyId, customerId) = SeedActivePolicy(agentAId);
        // Admin reassigns the customer to agent B.
        _factory.WithDb(db =>
        {
            db.Customers.Single(c => c.Id == customerId).AgentId = agentBId;
            return db.SaveChanges();
        });

        var observed = new List<string>();
        var aCustomer = await agentA.GetAsync($"/api/customers/{customerId}");
        observed.Add($"A GET customer -> {(int)aCustomer.StatusCode}");
        var aClaim = await agentA.PostAsJsonAsync("/api/claims", new
        {
            policyId, incidentDate = Today, description = "Mirror broken while parked.",
            claimedAmount = 100m, customerId, incidentType = "Vandalism", location = "Baku"
        });
        observed.Add($"A POST claim -> {(int)aClaim.StatusCode}");
        var aCancel = await agentA.PostAsync($"/api/policies/{policyId}/cancel", null);
        observed.Add($"A POST cancel -> {(int)aCancel.StatusCode}");
        var bCustomer = await agentB.GetAsync($"/api/customers/{customerId}");
        var bPolicies = bCustomer.IsSuccessStatusCode
            ? JsonDocument.Parse(await bCustomer.Content.ReadAsStringAsync()).RootElement.GetProperty("policies").GetArrayLength()
            : -1;
        observed.Add($"B GET customer -> {(int)bCustomer.StatusCode}, policies listed: {bPolicies}");

        Assert.True(aClaim.StatusCode == HttpStatusCode.NotFound && aCancel.StatusCode == HttpStatusCode.NotFound,
            string.Join("; ", observed));
    }

    [Fact]
    public async Task AUD_cover_bought_today_does_not_pay_for_an_incident_earlier_today()
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var vehicleId = _factory.WithDb(db => new TestData(db).Vehicle(customerId!.Value).Id);

        var created = await client.PostAsJsonAsync("/api/policies",
            new { vehicleId, policyTypeCode = "MTPL", startDate = Today, termMonths = 12 });
        var policyId = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/policies/{policyId}/pay", null)).StatusCode);

        // The incident happened this morning, before the policy existed.
        var claim = await client.PostAsJsonAsync("/api/claims", new
        {
            policyId, incidentDate = Today, description = "Collision at a junction this morning.",
            claimedAmount = 1500m, incidentType = "Collision", location = "Baku"
        });

        Assert.True(claim.StatusCode == HttpStatusCode.BadRequest,
            $"Claim for an incident on the purchase day returned {(int)claim.StatusCode}");
    }

    [Fact]
    public async Task AUD_changing_the_password_ends_other_sessions()
    {
        var anonymous = _factory.CreateClient();
        var email = $"audit-{Guid.NewGuid():N}@polisgo.test";
        var password = $"Pw-{Guid.NewGuid():N}-Aa1";
        var register = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            email, password, fullName = "Audit Person", phone = "+994501234567",
            birthDate = "1990-05-01", drivingLicenseDate = "2010-06-01"
        });
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);
        var login = await anonymous.PostAsJsonAsync("/api/auth/login", new { email, password });
        var other = JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement.GetProperty("token").GetString();
        var mine = JsonDocument.Parse(await register.Content.ReadAsStringAsync()).RootElement.GetProperty("token").GetString();

        using var me = _factory.CreateClient();
        me.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", mine);
        var change = await me.PostAsJsonAsync("/api/me/change-password",
            new { currentPassword = password, newPassword = $"Pw-{Guid.NewGuid():N}-Bb2" });
        Assert.True(change.IsSuccessStatusCode);

        using var stolen = _factory.CreateClient();
        stolen.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", other);
        var after = await stolen.GetAsync("/api/me");

        Assert.True(after.StatusCode == HttpStatusCode.Unauthorized,
            $"The other session still gets {(int)after.StatusCode} after a password change");
    }
}

public class AuditReproServiceTests
{
    [Fact]
    public async Task AUD_admin_stats_count_an_expired_policy_as_expired()
    {
        using var fixture = new SqliteTestDb();
        var data = new TestData(fixture.Db);
        var customer = data.Customer();
        var vehicle = data.Vehicle(customer.Id);
        // Active, ended two years ago: reads as Expired everywhere else.
        data.Policy(customer, vehicle, PolicyStatus.Active, createdAt: DateTime.UtcNow.AddYears(-3));

        var stats = await new AdminStatsService(fixture.NewContext(), new MemoryCache(new MemoryCacheOptions()),
            new FakeClock(DateTimeOffset.UtcNow)).GetAsync();

        var active = stats.Policies.ByStatus.Single(s => s.Status == PolicyStatus.Active).Count;
        var expired = stats.Policies.ByStatus.Single(s => s.Status == PolicyStatus.Expired).Count;
        Assert.True(expired == 1 && active == 0, $"stats: Active={active}, Expired={expired}");
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("prod")]
    public async Task AUD_demo_data_is_seeded_only_in_development(string environment)
    {
        using var fixture = new SqliteTestDb();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Demo:SeedData"] = "true" }).Build();

        var result = await DemoDataSeeder.SeedIfEnabledAsync(fixture.Db, config, environment,
            new BcryptPasswordHasher(), new PremiumCalculator(), TimeProvider.System);

        var staffWithDemoPassword = await fixture.Db.Users.CountAsync(u =>
            u.Email.EndsWith(DemoDataSeeder.Domain) && u.Role != UserRole.Client);
        Assert.True(result != DemoSeedResult.Seeded,
            $"{environment}: {result}, {staffWithDemoPassword} staff accounts with the documented password");
    }

    [Fact]
    public void AUD_two_different_valid_passwords_do_not_verify_against_each_other()
    {
        // 73 UTF-8 bytes of shared prefix: past BCrypt's 72-byte input limit.
        var prefix = "П1" + new string('ж', 35);
        var a = prefix + "aaaa";
        var b = prefix + "bbbb";
        Assert.Null(AuthValidation.PasswordError(a));
        Assert.Null(AuthValidation.PasswordError(b));

        var hasher = new BcryptPasswordHasher();
        Assert.False(hasher.Verify(b, hasher.Hash(a)),
            $"'{b.Length}-char password B' verifies against the hash of A ({System.Text.Encoding.UTF8.GetByteCount(a)} bytes)");
    }

    [Fact]
    public async Task AUD_two_concurrent_payments_charge_a_draft_once()
    {
        using var db = new FileSqliteDb();
        var (clientUser, customer, policyId) = db.Seed(ctx =>
        {
            var data = new TestData(ctx);
            var user = data.User(UserRole.Client);
            var c = data.Customer(userId: user.Id);
            var v = data.Vehicle(c.Id);
            return (user, c, data.Policy(c, v, PolicyStatus.Draft).Id);
        });
        var gateway = new BarrierPaymentGateway(parties: 2);
        var caller = new FakeCurrentUser { UserId = clientUser.Id, Role = UserRole.Client, CustomerId = customer.Id };

        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Capture(() =>
            new PolicyService(db.NewContext(), new PremiumCalculator(), gateway, caller).PayAsync(policyId))));

        await using var check = db.NewContext();
        var payments = await check.Payments.CountAsync(p => p.PolicyId == policyId);
        var activations = await check.PolicyStatusHistory.CountAsync(h => h.PolicyId == policyId && h.ToStatus == PolicyStatus.Active);
        Assert.True(gateway.Calls == 1 && payments == 1,
            $"charges={gateway.Calls}, payment rows={payments}, Draft->Active rows={activations}, results=[{string.Join(", ", results)}]");
    }

    [Fact]
    public async Task AUD_two_concurrent_payouts_pay_a_claim_once()
    {
        using var db = new FileSqliteDb();
        var (admins, claimId) = db.Seed(ctx =>
        {
            var data = new TestData(ctx);
            var a1 = data.User(UserRole.Admin);
            var a2 = data.User(UserRole.Admin);
            var c = data.Customer();
            var p = data.Policy(c, data.Vehicle(c.Id));
            return (new[] { a1.Id, a2.Id }, data.Claim(p, ClaimStatus.Approved, approved: 400m, adjusterId: a1.Id).Id);
        });
        var payouts = new BarrierPayoutGateway(parties: 2);

        var results = await Task.WhenAll(admins.Select(id => Capture(() =>
            new ClaimService(db.NewContext(), new FakeCurrentUser { UserId = id, Role = UserRole.Admin }, payouts,
                Options.Create(new ClaimOptions())).PayAsync(claimId, new PayClaimRequest(null)))));

        Assert.True(payouts.Calls == 1, $"payout gateway called {payouts.Calls} times; results=[{string.Join(", ", results)}]");
    }

    [Fact]
    public async Task AUD_two_admins_deactivating_each_other_keep_one_active_admin()
    {
        using var db = new FileSqliteDb();
        var (a, b) = db.Seed(ctx =>
        {
            var data = new TestData(ctx);
            return (data.User(UserRole.Admin), data.User(UserRole.Admin));
        });
        var barrier = new SaveBarrier(parties: 2);
        StaffAdminService As(Guid me) => new(db.NewContext(barrier),
            new FakeCurrentUser { UserId = me, Role = UserRole.Admin }, new BcryptPasswordHasher(), TimeProvider.System);

        var results = await Task.WhenAll(
            Capture(() => As(a.Id).DeactivateAsync(b.Id)),
            Capture(() => As(b.Id).DeactivateAsync(a.Id)));

        await using var check = db.NewContext();
        var activeAdmins = await check.Users.CountAsync(u => u.Role == UserRole.Admin && u.IsActive);
        Assert.True(activeAdmins >= 1, $"active admins left: {activeAdmins}; results=[{string.Join(", ", results)}]");
    }

    private static async Task<string> Capture<T>(Func<Task<T>> action)
    {
        try
        {
            await action();
            return "ok";
        }
        catch (Exception ex)
        {
            return ex.GetType().Name;
        }
    }
}

// A SQLite file shared by several connections, so two "requests" really run
// side by side (the in-memory fixture has one connection).
internal sealed class FileSqliteDb : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"polisgo-audit-{Guid.NewGuid():N}.db");

    public FileSqliteDb()
    {
        using var ctx = NewContext();
        ctx.Database.EnsureCreated();
    }

    public AppDbContext NewContext(params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=30")
            .AddInterceptors(interceptors)
            .Options);

    public T Seed<T>(Func<AppDbContext, T> seed)
    {
        using var ctx = NewContext();
        return seed(ctx);
    }

    public void Dispose()
    {
        try { File.Delete(_path); } catch (IOException) { }
    }
}

// Lets N callers in before any continues; a single caller goes on after 3 s.
internal abstract class ArrivalGate(int parties)
{
    private int _arrived;
    private readonly TaskCompletionSource _all = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public int Calls => _arrived;

    protected async Task ArriveAsync()
    {
        if (Interlocked.Increment(ref _arrived) >= parties) _all.TrySetResult();
        try { await _all.Task.WaitAsync(TimeSpan.FromSeconds(3)); } catch (TimeoutException) { }
    }
}

internal sealed class BarrierPaymentGateway(int parties) : ArrivalGate(parties), IPaymentGateway
{
    public async Task<PaymentReceipt> ChargeAsync(Guid policyId, decimal amount, CancellationToken cancellationToken = default)
    {
        await ArriveAsync();
        return new PaymentReceipt($"T-{Guid.NewGuid():N}"[..20], DateTime.UtcNow);
    }
}

internal sealed class BarrierPayoutGateway(int parties) : ArrivalGate(parties), IPayoutGateway
{
    public async Task<PayoutReceipt> PayoutAsync(Guid claimId, decimal amount, CancellationToken cancellationToken = default)
    {
        await ArriveAsync();
        return new PayoutReceipt($"P-{Guid.NewGuid():N}"[..20], DateTime.UtcNow);
    }
}

internal sealed class SaveBarrier(int parties) : SaveChangesInterceptor
{
    private readonly BarrierImpl _barrier = new(parties);

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        await _barrier.WaitAsync();
        return result;
    }

    private sealed class BarrierImpl(int parties) : ArrivalGate(parties)
    {
        public Task WaitAsync() => ArriveAsync();
    }
}
