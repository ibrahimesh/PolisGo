using System.Collections.Concurrent;
using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Payments;

// Stand-in for a real payout rail. ClaimService claims the payout in the
// database before calling it, so concurrent requests reach it once; it also
// honours the idempotency key like a real rail, so a retry after a failure
// gets the first receipt instead of a second payout.
public class FakePayoutGateway : IPayoutGateway
{
    private readonly ConcurrentDictionary<string, PayoutReceipt> _receipts = new();

    public Task<PayoutReceipt> PayoutAsync(
        Guid claimId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        var receipt = _receipts.GetOrAdd(idempotencyKey, _ =>
            new PayoutReceipt($"PAYOUT-{Guid.NewGuid():N}"[..20].ToUpperInvariant(), DateTime.UtcNow));
        return Task.FromResult(receipt);
    }
}
