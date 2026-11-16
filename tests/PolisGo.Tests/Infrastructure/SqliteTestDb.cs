using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// Spins up a fresh AppDbContext backed by a SQLite in-memory connection.
// SQLite preserves unique indexes and FK constraints, which lets us rely on
// real database behavior in tests rather than rebuilding it in C#.
internal sealed class SqliteTestDb : IDisposable
{
    public AppDbContext Db { get; }
    private readonly SqliteConnection _connection;

    public SqliteTestDb()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;
        Db = new AppDbContext(options);
        Db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}
