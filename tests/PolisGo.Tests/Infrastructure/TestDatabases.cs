using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// A database several contexts can use at once, so two "requests" really run
// side by side (the in-memory SqliteTestDb has a single connection).
internal interface ITestDatabase : IDisposable
{
    AppDbContext NewContext(params IInterceptor[] interceptors);
}

// SQLite on a temp file: one connection per context, real locking.
internal sealed class FileSqliteDb : ITestDatabase
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"polisgo-test-{Guid.NewGuid():N}.db");

    public FileSqliteDb()
    {
        using var db = NewContext();
        db.Database.EnsureCreated();
    }

    public AppDbContext NewContext(params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=30")
            .AddInterceptors(interceptors)
            .Options);

    public void Dispose()
    {
        try { File.Delete(_path); } catch (IOException) { /* best effort */ }
    }
}

// A fresh database on the SQL Server named by POLISGO_TEST_SQLSERVER, built by
// the real migrations (optionally only up to one), dropped afterwards. SQLite
// can't show SQL Server's locking, decimal rounding or migration SQL.
internal sealed class SqlServerTestDb : ITestDatabase
{
    public const string ConnectionVariable = "POLISGO_TEST_SQLSERVER";
    public static string? ServerConnectionString => Environment.GetEnvironmentVariable(ConnectionVariable);

    private readonly string _connectionString;

    public SqlServerTestDb(string? targetMigration = null)
    {
        _connectionString = new SqlConnectionStringBuilder(ServerConnectionString)
        {
            InitialCatalog = $"PolisGoTest_{Guid.NewGuid():N}"
        }.ConnectionString;
        Migrate(targetMigration);
    }

    public void Migrate(string? targetMigration = null)
    {
        using var db = NewContext();
        if (targetMigration is null) db.Database.Migrate();
        else db.GetService<IMigrator>().Migrate(targetMigration);
    }

    public AppDbContext NewContext(params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(_connectionString)
            .AddInterceptors(interceptors)
            .Options);

    public void Dispose()
    {
        using var db = NewContext();
        db.Database.EnsureDeleted();
    }
}

// Runs only when POLISGO_TEST_SQLSERVER points at a SQL Server (the CI job
// "SQL Server integration tests" sets it); skipped otherwise.
public sealed class SqlServerFactAttribute : FactAttribute
{
    public SqlServerFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(SqlServerTestDb.ServerConnectionString))
        {
            Skip = $"Set {SqlServerTestDb.ConnectionVariable} to a SQL Server connection string to run this test.";
        }
    }
}

// Lets N callers in together: each waits until all have arrived (or a short
// timeout passes, when the code under test lets only one through).
internal class ArrivalGate(int parties, TimeSpan? timeout = null)
{
    private int _arrived;
    private readonly TaskCompletionSource _all = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public int Arrivals => _arrived;

    public async Task ArriveAsync()
    {
        if (Interlocked.Increment(ref _arrived) >= parties) _all.TrySetResult();
        try { await _all.Task.WaitAsync(timeout ?? TimeSpan.FromSeconds(2)); }
        catch (TimeoutException) { /* the others never came: carry on alone */ }
    }
}

// Holds every context's first SaveChanges until all parties have read, so
// their checks run on the same state.
internal sealed class SaveGate(int parties) : SaveChangesInterceptor
{
    private readonly ArrivalGate _gate = new(parties);

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        await _gate.ArriveAsync();
        return result;
    }
}

internal static class Outcome
{
    // "ok" or the exception's type name, so a test can assert who won.
    public static async Task<string> Of<T>(Func<Task<T>> action)
    {
        try
        {
            await action();
            return "ok";
        }
        catch (Exception ex)
        {
            return ex.GetType().Name;
        }
    }
}
