using PolisGo.Tests.Infrastructure;
using Xunit.Abstractions;

namespace PolisGo.Tests.Search;

// Every list's search on SQL Server, built by the migrations: its collation
// and UPPER() fold differently from SQLite's (UPPER(N'İbrahim') is
// N'İBRAHIM'), which is why the searches compare folded keys. The SQLite
// sibling keeps the pair comparable in the CI job's filter.
[Trait("Category", "SqlServer")]
public class SearchFoldSqlServerTests(ITestOutputHelper output)
{
    [Fact]
    public Task Every_search_matches_on_sqlite() => RunAll(new FileSqliteDb());

    [SqlServerFact]
    public Task Every_search_matches_on_sql_server() => RunAll(new SqlServerTestDb());

    private async Task RunAll(ITestDatabase database)
    {
        using var _ = database;
        SearchFoldDataSet data;
        await using (var db = database.NewContext()) data = SearchFoldDataSet.Seed(db);
        var checks = new SearchFoldChecks(database, data);

        foreach (var row in SearchFoldDataSet.PeopleSearches) await checks.People((string)row[0], (string[])row[1]);
        foreach (var row in SearchFoldDataSet.BookSearches) await checks.Book((string)row[0], (string[])row[1]);
        foreach (var row in SearchFoldDataSet.ErrorSearches) await checks.Errors((string)row[0], (string[])row[1]);
        await checks.Codes();

        // What the database is asked to do: folded keys, no case functions.
        Assert.All(checks.Sql.Commands, sql =>
        {
            Assert.DoesNotContain("upper(", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("lower(", sql, StringComparison.OrdinalIgnoreCase);
        });
        foreach (var sql in checks.Sql.Commands.Where(c => c.Contains("SearchKey") && c.Contains("COUNT")).Distinct().Take(6))
        {
            output.WriteLine(sql);
            output.WriteLine("----");
        }
    }
}
