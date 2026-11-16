namespace PolisGo.Application.Abstractions;

public record PaymentReceipt(string Reference, DateTime ProcessedAt);

public interface IPaymentGateway
{
    // In production this hits a real PSP; here the Infrastructure impl is a
    // fake that always returns a receipt.
    Task<PaymentReceipt> ChargeAsync(
        Guid policyId,
        decimal amount,
        CancellationToken cancellationToken = default);
}
