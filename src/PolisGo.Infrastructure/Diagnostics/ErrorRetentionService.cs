using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;

namespace PolisGo.Infrastructure.Diagnostics;

// Daily, from a minute after startup: deletes error occurrences past their
// retention (30 days by default) and old hourly totals. A failed run is
// logged and tried again the next day.
public sealed class ErrorRetentionService(
    IServiceScopeFactory scopes,
    IOptions<ErrorTrackingOptions> options,
    TimeProvider clock,
    ILogger<ErrorRetentionService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(1), clock, stoppingToken);
            using var timer = new PeriodicTimer(TimeSpan.FromDays(1), clock);
            do
            {
                try
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
                    var (occurrences, counters) = await ErrorRetention.RunAsync(
                        db, clock.GetUtcNow().UtcDateTime, options.Value, stoppingToken);
                    if (occurrences + counters > 0)
                    {
                        logger.LogInformation("Error retention removed {Occurrences} occurrences and {Counters} hourly rows.",
                            occurrences, counters);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning("Error retention failed ({Type}); next run tomorrow.", ex.GetType().Name);
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }
}
