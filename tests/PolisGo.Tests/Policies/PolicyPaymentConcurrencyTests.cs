using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Policies;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Policies;

// Two payments for one Draft at the same moment (a second tab, a retry):
// exactly one may land, on SQLite and on SQL Server.
[Trait("Category", "SqlServer")]
public class PolicyPaymentConcurrencyTests
{
    [Fact]
    public Task Two_concurrent_payments_record_one_payment_on_sqlite() =>
        TwoConcurrentPaymentsRecordOnePayment(new FileSqliteDb());

    [SqlServerFact]
    public Task Two_concurrent_payments_record_one_payment_on_sql_server() =>
        TwoConcurrentPaymentsRecordOnePayment(new SqlServerTestDb());

    private static async Task TwoConcurrentPaymentsRecordOnePayment(ITestDatabase database)
    {
        using var db = database;
        Guid userId, customerId, policyId;
        using (var seed = db.NewContext())
        {
            var data = new TestData(seed);
            var user = data.User(UserRole.Client);
            var customer = data.Customer(userId: user.Id);
            (userId, customerId) = (user.Id, customer.Id);
            policyId = data.Policy(customer, data.Vehicle(customer.Id), PolicyStatus.Draft).Id;
        }
        var gateway = new GatedPaymentGateway(parties: 2);
        var caller = new FakeCurrentUser { UserId = userId, Role = UserRole.Client, CustomerId = customerId };

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Outcome.Of(() =>
            new PolicyService(db.NewContext(), new PremiumCalculator(), gateway, caller).PayAsync(policyId))));

        using var check = db.NewContext();
        var payments = await check.Payments.CountAsync(p => p.PolicyId == policyId);
        var activations = await check.PolicyStatusHistory
            .CountAsync(h => h.PolicyId == policyId && h.ToStatus == PolicyStatus.Active);
        var detail = $"outcomes=[{string.Join(", ", outcomes)}], gateway calls={gateway.Arrivals}";
        Assert.True(payments == 1, $"payment rows={payments}; {detail}");
        Assert.True(activations == 1, $"Draft->Active rows={activations}; {detail}");
        Assert.Equal(1, outcomes.Count(o => o == "ok"));
        // The loser is a concurrency failure (409), not a server error.
        Assert.All(outcomes.Where(o => o != "ok"), o => Assert.Contains("DbUpdate", o));
        // Both charges carried the same key, so a real PSP charges once.
        Assert.Single(gateway.Keys.Distinct());
        Assert.Contains(policyId.ToString("N"), gateway.Keys.First());
    }

    [Fact]
    public async Task The_fake_gateway_returns_the_first_receipt_for_a_repeated_key()
    {
        var gateway = new PolisGo.Infrastructure.Payments.FakePaymentGateway();
        var policyId = Guid.NewGuid();

        var first = await gateway.ChargeAsync(policyId, 50m, "policy-payment:one");
        var again = await gateway.ChargeAsync(policyId, 50m, "policy-payment:one");
        var other = await gateway.ChargeAsync(policyId, 50m, "policy-payment:two");

        Assert.Equal(first, again);
        Assert.NotEqual(first.Reference, other.Reference);
    }

    // Both callers reach the gateway before either saves.
    private sealed class GatedPaymentGateway(int parties) : ArrivalGate(parties), IPaymentGateway
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> _keys = new();
        public IReadOnlyCollection<string> Keys => _keys;

        public async Task<PaymentReceipt> ChargeAsync(
            Guid policyId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
        {
            _keys.Enqueue(idempotencyKey);
            await ArriveAsync();
            return new PaymentReceipt($"T-{Guid.NewGuid():N}"[..20], DateTime.UtcNow);
        }
    }
}
