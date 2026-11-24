using PolisGo.Application.Admin;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Admin;

// The same production-sized searches on SQL Server, built by the migrations:
// its collation and UPPER() fold differently from SQLite's (UPPER('İbrahim')
// is 'İBRAHIM' there), which is why the search compares folded keys. The
// SQLite sibling keeps the pair comparable in the CI job's filter.
[Trait("Category", "SqlServer")]
public class AuditSearchSqlServerTests
{
    [Fact]
    public Task Every_search_matches_on_sqlite() => RunAll(new FileSqliteDb());

    [SqlServerFact]
    public Task Every_search_matches_on_sql_server() => RunAll(new SqlServerTestDb());

    private static async Task RunAll(ITestDatabase database)
    {
        using var _ = database;
        AuditSearchDataSet data;
        await using (var db = database.NewContext()) data = AuditSearchDataSet.Seed(db);

        foreach (var search in AuditSearchTests.Searches)
        {
            var typed = (string)search[0];
            var tag = (string)search[1];
            await using var db = database.NewContext();
            await AuditSearchTests.AssertSearch(new AuditLogService(db), data, typed, tag);
        }
    }
}
