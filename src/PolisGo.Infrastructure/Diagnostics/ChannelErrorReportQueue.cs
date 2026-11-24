using System.Threading.Channels;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;

namespace PolisGo.Infrastructure.Diagnostics;

// A bounded in-memory channel between requests and the writer. Full means
// the writer is behind (or the database is down): the newest reports are
// dropped and counted rather than held, so memory stays bounded and no
// request ever waits on error tracking.
public sealed class ChannelErrorReportQueue : IErrorReportQueue
{
    private readonly Channel<ErrorReport> _channel;
    private long _dropped;

    public ChannelErrorReportQueue(IOptions<ErrorTrackingOptions> options)
    {
        _channel = Channel.CreateBounded<ErrorReport>(new BoundedChannelOptions(Math.Max(1, options.Value.QueueCapacity))
        {
            // Wait (not a Drop* mode) so TryWrite reports a full queue and the
            // drop can be counted; TryWrite itself never waits.
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ChannelReader<ErrorReport> Reader => _channel.Reader;

    public bool TryEnqueue(ErrorReport report)
    {
        if (_channel.Writer.TryWrite(report)) return true;
        Interlocked.Increment(ref _dropped);
        return false;
    }

    public int Depth => _channel.Reader.Count;

    public long Dropped => Interlocked.Read(ref _dropped);

    public void CountDropped(int reports) => Interlocked.Add(ref _dropped, reports);
}
