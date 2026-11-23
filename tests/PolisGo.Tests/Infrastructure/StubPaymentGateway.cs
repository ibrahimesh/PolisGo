using PolisGo.Application.Abstractions;

namespace PolisGo.Tests.Infrastructure;

internal sealed class StubPaymentGateway : IPaymentGateway
{
    public int CallCount { get; private set; }
    public decimal LastAmount { get; private set; }
    public string? LastIdempotencyKey { get; private set; }

    public Task<PaymentReceipt> ChargeAsync(
        Guid policyId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        CallCount++;
        LastAmount = amount;
        LastIdempotencyKey = idempotencyKey;
        return Task.FromResult(new PaymentReceipt($"TEST-{policyId:N}"[..20], DateTime.UtcNow));
    }
}
