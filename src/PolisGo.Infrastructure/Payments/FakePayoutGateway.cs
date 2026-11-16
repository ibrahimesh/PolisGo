using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Payments;

// Deterministic-ish stand-in for a real payout rail. Idempotency is handled by
// the caller (ClaimService guards against re-entering the Paid state via the
// Claim state machine), so the gateway itself just mints a reference.
public class FakePayoutGateway : IPayoutGateway
{
    public Task<PayoutReceipt> PayoutAsync(
        Guid claimId, decimal amount, CancellationToken cancellationToken = default)
    {
        var reference = $"PAYOUT-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        return Task.FromResult(new PayoutReceipt(reference, DateTime.UtcNow));
    }
}
