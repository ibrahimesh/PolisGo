using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Infrastructure.Diagnostics;

// A trivial query timed end to end, then the migration history. Three
// seconds at most; any failure reads as "not reachable", with no detail
// (the detail of a connection failure is where connection strings leak).
public sealed class DatabaseProbe(AppDbContext db) : IDatabaseProbe
{
    public async Task<DatabaseHealth> ProbeAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            var watch = Stopwatch.StartNew();
            await db.Database.ExecuteSqlRawAsync("SELECT 1", timeout.Token);
            var roundTrip = Math.Round(watch.Elapsed.TotalMilliseconds, 1);
            var applied = (await db.Database.GetAppliedMigrationsAsync(timeout.Token)).ToList();
            var pending = (await db.Database.GetPendingMigrationsAsync(timeout.Token)).ToList();
            return new DatabaseHealth(true, roundTrip, applied.LastOrDefault(), pending);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            return new DatabaseHealth(false, null, null, []);
        }
    }
}
