using PolisGo.Application.Abstractions;

namespace PolisGo.Infrastructure.Payments;

// Deterministic-ish stand-in for a real PSP so the Pay flow can be exercised
// end-to-end in development and tests without touching external services.
// Always succeeds and returns a synthetic reference.
public class FakePaymentGateway : IPaymentGateway
{
    public Task<PaymentReceipt> ChargeAsync(
        Guid policyId, decimal amount, CancellationToken cancellationToken = default)
    {
        var reference = $"FAKE-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        return Task.FromResult(new PaymentReceipt(reference, DateTime.UtcNow));
    }
}
