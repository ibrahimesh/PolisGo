using PolisGo.Application.Abstractions;

namespace PolisGo.Api.Diagnostics;

// Rejections per minute in a 24-hour ring: fixed memory however many
// requests are refused.
public sealed class RateLimitMonitor(TimeProvider clock) : IRateLimitMonitor
{
    private const int Minutes = 24 * 60;
    private readonly long[] _counts = new long[Minutes];
    private readonly long[] _stamps = new long[Minutes];

    public void RecordRejection()
    {
        var minute = clock.GetUtcNow().ToUnixTimeSeconds() / 60;
        var slot = (int)(minute % Minutes);
        lock (_counts)
        {
            if (_stamps[slot] != minute)
            {
                _stamps[slot] = minute;
                _counts[slot] = 0;
            }
            _counts[slot]++;
        }
    }

    public long RejectionsInLast24Hours()
    {
        var now = clock.GetUtcNow().ToUnixTimeSeconds() / 60;
        long total = 0;
        lock (_counts)
        {
            for (var i = 0; i < Minutes; i++)
            {
                if (now - _stamps[i] < Minutes) total += _counts[i];
            }
        }
        return total;
    }
}
