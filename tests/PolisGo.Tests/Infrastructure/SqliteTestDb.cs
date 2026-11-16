using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// Spins up a SQLite in-memory database so SQL-level constraints (unique
// indexes, FKs, concurrency tokens) behave like production. Hands out fresh
// AppDbContext instances per "logical request" to match the scoped-DbContext
// lifetime the API uses — avoiding change-tracker state bleeding between
// service calls that would never share a context in production.
internal sealed class SqliteTestDb : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public AppDbContext Db { get; }

    public SqliteTestDb()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.AmbientTransactionWarning))
            .Options;
        Db = new AppDbContext(_options);
        Db.Database.EnsureCreated();
    }

    // New context over the same connection: equivalent to a new scoped
    // DbContext in a web request against the same database.
    public AppDbContext NewContext() => new(_options);

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}
