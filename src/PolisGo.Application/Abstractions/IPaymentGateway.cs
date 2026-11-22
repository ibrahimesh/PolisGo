namespace PolisGo.Application.Abstractions;

public record PaymentReceipt(string Reference, DateTime ProcessedAt);

public interface IPaymentGateway
{
    // In production this hits a real PSP; here the Infrastructure impl is a
    // fake that always returns a receipt. The idempotency key makes a repeated
    // charge (a retry, a second tab) return the first receipt instead of
    // charging again, as PSPs do for a repeated key.
    Task<PaymentReceipt> ChargeAsync(
        Guid policyId,
        decimal amount,
        string idempotencyKey,
        CancellationToken cancellationToken = default);
}
