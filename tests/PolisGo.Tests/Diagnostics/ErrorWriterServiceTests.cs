using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;
using PolisGo.Infrastructure.Diagnostics;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Diagnostics;

// The background writer: drains the queue into the database, and when the
// database won't take a batch, drops and counts it instead of looping.
public class ErrorWriterServiceTests
{
    private static ServiceProvider Services(FileSqliteDb database, IErrorRecorder? recorder = null)
    {
        var services = new ServiceCollection();
        services.AddScoped<AppDbContext>(_ => database.NewContext());
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IAppInfo, ErrorRecorderTests.TestApp>();
        services.AddSingleton(Options.Create(new ErrorTrackingOptions { QueueCapacity = 50, BatchSize = 10 }));
        if (recorder is null) services.AddScoped<IErrorRecorder, ErrorRecorder>();
        else services.AddSingleton(recorder);
        return services.BuildServiceProvider();
    }

    private static async Task Until(Func<Task<bool>> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!await condition())
        {
            if (DateTime.UtcNow > deadline) throw new TimeoutException("condition not met");
            await Task.Delay(25);
        }
    }

    [Fact]
    public async Task Queued_reports_end_up_stored_in_batches()
    {
        using var database = new FileSqliteDb();
        await using var provider = Services(database);
        var options = provider.GetRequiredService<IOptions<ErrorTrackingOptions>>();
        var queue = new ChannelErrorReportQueue(options);
        var writer = new ErrorWriterService(queue, provider.GetRequiredService<IServiceScopeFactory>(), options,
            NullLogger<ErrorWriterService>.Instance);

        await writer.StartAsync(CancellationToken.None);
        var now = DateTime.UtcNow;
        for (var i = 0; i < 25; i++) Assert.True(queue.TryEnqueue(ErrorRecorderTests.Backend(now.AddMilliseconds(i))));

        await Until(async () =>
        {
            await using var db = database.NewContext();
            return await db.ErrorGroups.SumAsync(g => (long?)g.OccurrenceCount) == 25;
        });
        await writer.StopAsync(CancellationToken.None);
        Assert.Equal(0, queue.Depth);
        Assert.Equal(0, queue.Dropped);
    }

    [Fact]
    public void A_full_queue_drops_and_counts_instead_of_waiting()
    {
        var queue = new ChannelErrorReportQueue(Options.Create(new ErrorTrackingOptions { QueueCapacity = 2 }));
        var report = ErrorRecorderTests.Backend(DateTime.UtcNow);

        Assert.True(queue.TryEnqueue(report));
        Assert.True(queue.TryEnqueue(report));
        Assert.False(queue.TryEnqueue(report));

        Assert.Equal(2, queue.Depth);
        Assert.Equal(1, queue.Dropped);
    }

    [Fact]
    public async Task A_batch_the_database_refuses_is_retried_then_dropped_and_counted()
    {
        using var database = new FileSqliteDb();
        var failing = new FailingRecorder();
        await using var provider = Services(database, failing);
        var options = provider.GetRequiredService<IOptions<ErrorTrackingOptions>>();
        var queue = new ChannelErrorReportQueue(options);
        var writer = new ErrorWriterService(queue, provider.GetRequiredService<IServiceScopeFactory>(), options,
            NullLogger<ErrorWriterService>.Instance);

        await writer.StartAsync(CancellationToken.None);
        queue.TryEnqueue(ErrorRecorderTests.Backend(DateTime.UtcNow));
        await Until(() => Task.FromResult(queue.Dropped == 1));
        await writer.StopAsync(CancellationToken.None);

        Assert.Equal(3, failing.Calls);
    }

    private sealed class FailingRecorder : IErrorRecorder
    {
        public int Calls;

        public Task RecordAsync(IReadOnlyList<ErrorReport> batch, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref Calls);
            throw new InvalidOperationException("database is down");
        }
    }
}
