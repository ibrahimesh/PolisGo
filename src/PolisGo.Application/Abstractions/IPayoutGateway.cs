namespace PolisGo.Application.Abstractions;

public record PayoutReceipt(string Reference, DateTime ProcessedAt);

public interface IPayoutGateway
{
    // Pays out an approved claim to the insured. The Infrastructure fake
    // always succeeds so the workflow can be exercised end-to-end locally.
    Task<PayoutReceipt> PayoutAsync(
        Guid claimId,
        decimal amount,
        CancellationToken cancellationToken = default);
}
