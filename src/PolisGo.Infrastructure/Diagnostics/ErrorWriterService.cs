using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PolisGo.Application.Diagnostics;

namespace PolisGo.Infrastructure.Diagnostics;

// Drains the error queue in batches and stores them (ErrorRecorder), off the
// request path. A batch that fails (a concurrency conflict with an admin's
// triage, a database hiccup) is retried with a fresh context; one that still
// fails is dropped and counted, never retried forever.
public sealed class ErrorWriterService(
    ChannelErrorReportQueue queue,
    IServiceScopeFactory scopes,
    IOptions<ErrorTrackingOptions> options,
    ILogger<ErrorWriterService> logger) : BackgroundService
{
    private const int Attempts = 3;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var batchSize = Math.Max(1, options.Value.BatchSize);
        var batch = new List<ErrorReport>(batchSize);
        try
        {
            while (await queue.Reader.WaitToReadAsync(stoppingToken))
            {
                batch.Clear();
                while (batch.Count < batchSize && queue.Reader.TryRead(out var report)) batch.Add(report);
                await WriteAsync(batch, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down; whatever is still queued is lost with the process.
        }
    }

    private async Task WriteAsync(List<ErrorReport> batch, CancellationToken stoppingToken)
    {
        for (var attempt = 1; attempt <= Attempts; attempt++)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IErrorRecorder>().RecordAsync(batch, stoppingToken);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // The type only: the message may hold what redaction exists to remove.
                logger.LogWarning("Storing {Count} error reports failed ({Type}), attempt {Attempt}.",
                    batch.Count, ex.GetType().Name, attempt);
                if (attempt < Attempts) await Task.Delay(TimeSpan.FromMilliseconds(200 * attempt), stoppingToken);
            }
        }
        queue.CountDropped(batch.Count);
    }
}
