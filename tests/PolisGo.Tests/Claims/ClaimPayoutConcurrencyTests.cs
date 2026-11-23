using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Claims;

// Two payouts of one Approved claim at the same moment: the money may leave
// once. The payout is claimed in the database before the gateway is called.
[Trait("Category", "SqlServer")]
public class ClaimPayoutConcurrencyTests
{
    [Fact]
    public Task Two_concurrent_payouts_call_the_gateway_once_on_sqlite() =>
        TwoConcurrentPayoutsCallTheGatewayOnce(new FileSqliteDb());

    [SqlServerFact]
    public Task Two_concurrent_payouts_call_the_gateway_once_on_sql_server() =>
        TwoConcurrentPayoutsCallTheGatewayOnce(new SqlServerTestDb());

    private static async Task TwoConcurrentPayoutsCallTheGatewayOnce(ITestDatabase database)
    {
        using var db = database;
        var (admins, claimId) = SeedApprovedClaim(db);
        var payouts = new GatedPayoutGateway(parties: 2);
        var gate = new SaveGate(parties: 2);

        var outcomes = await Task.WhenAll(admins.Select(id => Outcome.Of(() =>
            Service(db.NewContext(gate), id, payouts).PayAsync(claimId, new PayClaimRequest(null)))));

        using var check = db.NewContext();
        var paidRows = await check.ClaimStatusHistory.CountAsync(h => h.ClaimId == claimId && h.ToStatus == ClaimStatus.Paid);
        var detail = $"outcomes=[{string.Join(", ", outcomes)}]";
        Assert.True(payouts.Arrivals == 1, $"payout gateway called {payouts.Arrivals} times; {detail}");
        Assert.Equal(1, paidRows);
        Assert.Equal(1, outcomes.Count(o => o == "ok"));
        // The loser is a concurrency failure (409 "Concurrent update").
        Assert.All(outcomes.Where(o => o != "ok"), o => Assert.Equal("DbUpdateConcurrencyException", o));
    }

    [Fact]
    public async Task A_failed_payout_leaves_the_claim_approved_and_a_retry_pays_with_the_same_key()
    {
        using var db = new FileSqliteDb();
        var (admins, claimId) = SeedApprovedClaim(db);
        var payouts = new FailingOncePayoutGateway();

        await Assert.ThrowsAsync<TimeoutException>(() =>
            Service(db.NewContext(), admins[0], payouts).PayAsync(claimId, new PayClaimRequest(null)));
        using (var check = db.NewContext())
        {
            var claim = await check.Claims.Include(c => c.StatusHistory).SingleAsync(c => c.Id == claimId);
            Assert.Equal(ClaimStatus.Approved, claim.Status);
            Assert.NotNull(claim.PayoutRequestedAt);
            Assert.DoesNotContain(claim.StatusHistory, h => h.ToStatus == ClaimStatus.Paid);
        }

        var paid = await Service(db.NewContext(), admins[0], payouts).PayAsync(claimId, new PayClaimRequest(null));

        Assert.Equal(ClaimStatus.Paid, paid.Status);
        Assert.Equal(2, payouts.Keys.Count);
        Assert.Single(payouts.Keys.Distinct());
        Assert.Contains(claimId.ToString("N"), payouts.Keys[0]);
    }

    [Fact]
    public async Task The_fake_payout_gateway_returns_the_first_receipt_for_a_repeated_key()
    {
        var gateway = new PolisGo.Infrastructure.Payments.FakePayoutGateway();
        var claimId = Guid.NewGuid();

        var first = await gateway.PayoutAsync(claimId, 400m, "claim-payout:one");
        var again = await gateway.PayoutAsync(claimId, 400m, "claim-payout:one");

        Assert.Equal(first, again);
    }

    private static (Guid[] Admins, Guid ClaimId) SeedApprovedClaim(ITestDatabase db)
    {
        using var seed = db.NewContext();
        var data = new TestData(seed);
        var first = data.User(UserRole.Admin);
        var second = data.User(UserRole.Admin);
        var customer = data.Customer();
        var policy = data.Policy(customer, data.Vehicle(customer.Id));
        var claim = data.Claim(policy, ClaimStatus.Approved, approved: 400m, adjusterId: first.Id);
        return ([first.Id, second.Id], claim.Id);
    }

    private static ClaimService Service(PolisGo.Infrastructure.Persistence.AppDbContext db, Guid adminId, IPayoutGateway payouts) =>
        new(db, new FakeCurrentUser { UserId = adminId, Role = UserRole.Admin }, payouts, Options.Create(new ClaimOptions()));

    // Counts calls; both callers would wait here for each other.
    private sealed class GatedPayoutGateway(int parties) : ArrivalGate(parties), IPayoutGateway
    {
        public async Task<PayoutReceipt> PayoutAsync(
            Guid claimId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
        {
            await ArriveAsync();
            return new PayoutReceipt($"P-{Guid.NewGuid():N}"[..20], DateTime.UtcNow);
        }
    }

    // The rail times out once, then works.
    private sealed class FailingOncePayoutGateway : IPayoutGateway
    {
        public List<string> Keys { get; } = [];

        public Task<PayoutReceipt> PayoutAsync(
            Guid claimId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
        {
            Keys.Add(idempotencyKey);
            return Keys.Count == 1
                ? throw new TimeoutException("Payout rail did not answer.")
                : Task.FromResult(new PayoutReceipt("P-RETRY", DateTime.UtcNow));
        }
    }
}
