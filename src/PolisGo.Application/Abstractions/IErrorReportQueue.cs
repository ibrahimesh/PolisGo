using PolisGo.Application.Diagnostics;

namespace PolisGo.Application.Abstractions;

// Hand-off from a request to the background error writer. TryEnqueue never
// blocks and never throws: when the queue is full the report is dropped and
// counted, so capturing an error can't slow or break the request.
public interface IErrorReportQueue
{
    bool TryEnqueue(ErrorReport report);
    int Depth { get; }
    long Dropped { get; }
    // Called by the writer when a batch couldn't be stored after retries.
    void CountDropped(int reports);
}
