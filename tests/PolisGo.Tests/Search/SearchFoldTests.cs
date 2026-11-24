using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Common;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Search;

// One rule for every text search (SearchText, ADR-001). Claims, policies and
// customers used to compare SQL's UPPER() of the name: SQLite folds ASCII only
// ("ольга" never found "Ольга", "gülnarə" never found "GÜLNARƏ"), and SQL
// Server leaves İ as İ, so "ibrahim" never found "İbrahim".
public class SearchFoldTests : IClassFixture<SearchFoldTests.Seeded>
{
    public sealed class Seeded : IDisposable
    {
        internal FileSqliteDb Database { get; } = new();
        internal SearchFoldDataSet Data { get; }

        public Seeded()
        {
            using var db = Database.NewContext();
            Data = SearchFoldDataSet.Seed(db);
        }

        public void Dispose() => Database.Dispose();
    }

    private readonly SearchFoldChecks _checks;

    public SearchFoldTests(Seeded seeded) => _checks = new SearchFoldChecks(seeded.Database, seeded.Data);

    [Theory]
    [MemberData(nameof(SearchFoldDataSet.PeopleSearches), MemberType = typeof(SearchFoldDataSet))]
    public Task Claims_policies_customers_and_staff_find_the_named_people(string typed, string[] expected) =>
        _checks.People(typed, expected);

    [Theory]
    [MemberData(nameof(SearchFoldDataSet.BookSearches), MemberType = typeof(SearchFoldDataSet))]
    public Task An_agent_searches_only_their_book(string typed, string[] expected) => _checks.Book(typed, expected);

    [Theory]
    [MemberData(nameof(SearchFoldDataSet.ErrorSearches), MemberType = typeof(SearchFoldDataSet))]
    public Task Error_groups_are_found_by_title_type_or_endpoint_in_any_language(string typed, string[] expected) =>
        _checks.Errors(typed, expected);

    [Fact]
    public Task Numbers_and_plates_are_found_in_any_case() => _checks.Codes();

    // The database compares folded text with folded text: no UPPER() or
    // LOWER() on a column, which would also put a function between the
    // column and any index on it.
    [Fact]
    public async Task No_search_folds_case_in_sql()
    {
        await _checks.People("İbrahim", ["ibrahim"]);
        await _checks.Errors("ŞƏKİL", ["az"]);
        await _checks.Codes();

        var searches = _checks.Sql.Commands.Where(c => c.Contains("SearchKey")).ToList();
        Assert.NotEmpty(searches);
        Assert.All(_checks.Sql.Commands, sql =>
        {
            Assert.DoesNotContain("upper(", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("lower(", sql, StringComparison.OrdinalIgnoreCase);
        });
    }

    [Theory]
    [InlineData("ŞİRİNOV", "şirinov")]
    [InlineData("ÇƏLƏBİ", "çələbi")]
    [InlineData("AĞAYEVA ÖMƏR ÜLVİYYƏ", "ağayeva ömər ülviyyə")]
    [InlineData("HACIYEVA", "haciyeva")]
    [InlineData("Hacıyeva", "haciyeva")]
    [InlineData("КОВАЛЁВА", "ковалева")]
    public void Fold_lowers_every_letter_the_names_use(string text, string folded) =>
        Assert.Equal(folded, SearchText.Fold(text));

    [Theory]
    [InlineData("pg-2026-sf001", "PG-2026-SF001")]
    [InlineData("77-ıb-000", "77-IB-000")]
    [InlineData("77-İb-000", "77-IB-000")]
    [InlineData(" cl-2026 ", "CL-2026")]
    public void Code_is_the_typed_text_as_the_app_stores_its_numbers(string typed, string code) =>
        Assert.Equal(code, SearchText.Code(typed));

    // An error group saved before its key column existed is found only after
    // the startup backfill folds it.
    [Fact]
    public async Task Error_groups_saved_without_a_key_are_backfilled()
    {
        using var database = new FileSqliteDb();
        SearchFoldDataSet data;
        await using (var db = database.NewContext()) data = SearchFoldDataSet.Seed(db);
        await using (var db = database.NewContext())
        {
            await db.ErrorGroups.ExecuteUpdateAsync(s => s.SetProperty(g => EF.Property<string?>(g, SearchText.KeyProperty), (string?)null));
        }
        var checks = new SearchFoldChecks(database, data);
        await checks.Errors("ŞƏKİL", []);

        await using (var db = database.NewContext())
        {
            Assert.Equal(SearchFoldDataSet.Errors.Length, await SearchKeys.BackfillAsync(db));
        }
        await checks.Errors("ŞƏKİL", ["az"]);
    }

    // A renamed customer is found by the new name, not the old one.
    [Fact]
    public async Task The_key_follows_a_rename()
    {
        using var database = new FileSqliteDb();
        await using (var db = database.NewContext()) SearchFoldDataSet.Seed(db);
        await using (var db = database.NewContext())
        {
            var customer = await db.Customers.SingleAsync(c => c.FullName == "John Smith");
            customer.FullName = "Cəlal Şükürov";
            await db.SaveChangesAsync();
        }
        var admin = new FakeCurrentUser { UserId = Guid.NewGuid(), Role = UserRole.Admin };
        await using (var db = database.NewContext())
        {
            var found = await new CustomerService(db, admin).ListAsync(new ListCustomersQuery(Search: "ŞÜKÜROV"));
            Assert.Equal("Cəlal Şükürov", Assert.Single(found.Items).FullName);
            Assert.Empty((await new CustomerService(db, admin).ListAsync(new ListCustomersQuery(Search: "smith"))).Items);
        }
    }
}
