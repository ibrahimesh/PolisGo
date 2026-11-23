using System.Collections.Concurrent;
using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Payments;

// Stand-in for a real PSP so the Pay flow can be exercised end-to-end in
// development and tests without touching external services. Always succeeds,
// and honours the idempotency key like a PSP: the same key gets the same
// receipt, so a duplicate request never charges twice.
public class FakePaymentGateway : IPaymentGateway
{
    private readonly ConcurrentDictionary<string, PaymentReceipt> _receipts = new();

    public Task<PaymentReceipt> ChargeAsync(
        Guid policyId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        var receipt = _receipts.GetOrAdd(idempotencyKey, _ =>
            new PaymentReceipt($"FAKE-{Guid.NewGuid():N}"[..20].ToUpperInvariant(), DateTime.UtcNow));
        return Task.FromResult(receipt);
    }
}
