namespace PolisGo.Application.Abstractions;

// Counts requests the rate limiter turned away, for the health page. Kept in
// memory for 24 hours (reset when the API restarts): a gauge, not a ledger.
public interface IRateLimitMonitor
{
    void RecordRejection();
    long RejectionsInLast24Hours();
}
