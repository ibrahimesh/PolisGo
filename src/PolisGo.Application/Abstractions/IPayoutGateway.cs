namespace PolisGo.Application.Abstractions;

public record PayoutReceipt(string Reference, DateTime ProcessedAt);

public interface IPayoutGateway
{
    // Pays out an approved claim to the insured. The Infrastructure fake
    // always succeeds so the workflow can be exercised end-to-end locally.
    // The idempotency key makes a repeated payout (a retry after a failure or
    // a lost reply) return the first receipt instead of paying twice.
    Task<PayoutReceipt> PayoutAsync(
        Guid claimId,
        decimal amount,
        string idempotencyKey,
        CancellationToken cancellationToken = default);
}
