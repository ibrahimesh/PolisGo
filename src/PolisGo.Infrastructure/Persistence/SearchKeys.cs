using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PolisGo.Application.Common;
using PolisGo.Domain.Entities;

namespace PolisGo.Infrastructure.Persistence;

// Keeps the folded SearchKey columns (SearchText) in step with the text they
// fold. Done on every save rather than in the entities, which stay free of
// persistence concerns and are written from many places.
public static class SearchKeys
{
    public static void Apply(ChangeTracker tracker)
    {
        foreach (var entry in tracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;
            var key = For(entry.Entity);
            if (key is null) continue;
            var property = entry.Property(SearchText.KeyProperty);
            // Assigning an equal value would still mark the row modified.
            if (!Equals(property.CurrentValue, key)) property.CurrentValue = key;
        }
    }

    public static string? For(object entity) => entity switch
    {
        User u => SearchText.Key(u.FullName, u.Email),
        Customer c => SearchText.Key(c.FullName, c.Email),
        AuditEntry a => SearchText.Key(a.SubjectLabel, a.FromValue, a.ToValue),
        ErrorGroup g => SearchText.Key(g.Title, g.ExceptionType, g.Endpoint),
        _ => null,
    };

    // Rows written before the column existed have no key. Fills them in
    // batches; returns how many rows it updated.
    public static async Task<int> BackfillAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        return await FillAsync(db.Users, cancellationToken)
            + await FillAsync(db.Customers, cancellationToken)
            + await FillAsync(db.AuditEntries, cancellationToken)
            + await FillAsync(db.ErrorGroups, cancellationToken);

        async Task<int> FillAsync<T>(DbSet<T> set, CancellationToken ct) where T : class
        {
            const int batch = 500;
            var total = 0;
            while (true)
            {
                var rows = await set
                    .Where(row => EF.Property<string?>(row, SearchText.KeyProperty) == null)
                    .Take(batch)
                    .ToListAsync(ct);
                if (rows.Count == 0) return total;
                // Only the key column is written.
                foreach (var row in rows)
                {
                    db.Entry(row).Property(SearchText.KeyProperty).CurrentValue = For(row);
                }
                await db.SaveChangesAsync(ct);
                db.ChangeTracker.Clear();
                total += rows.Count;
                if (rows.Count < batch) return total;
            }
        }
    }
}

// Runs the backfill once after startup, off the request path: a database
// that is still warming up only delays it. Until it finishes, older rows are
// simply not found by text.
public sealed class SearchKeyBackfillService(IServiceScopeFactory scopes, ILogger<SearchKeyBackfillService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        for (var attempt = 1; attempt <= 10 && !stoppingToken.IsCancellationRequested; attempt++)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var filled = await SearchKeys.BackfillAsync(db, stoppingToken);
                if (filled > 0) logger.LogInformation("Search keys filled in for {Rows} rows.", filled);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Search key backfill attempt {Attempt} failed; retrying.", attempt);
                await Task.Delay(TimeSpan.FromSeconds(5 * attempt), stoppingToken);
            }
        }
    }
}
