using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Common;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Admin;

// The audit search over a production-sized log (AuditSearchDataSet). The
// owner typed "ibrahim" into a log of ~2,450 events and still saw every one,
// unrelated rows first. These pin the behaviour down: the count is the
// filtered count, every row involves someone the text names, newest first,
// and case is ignored for Latin, Cyrillic and Azerbaijani letters.
public class AuditSearchTests
{
    // Typed text → the tag of the people it must find (see the data set).
    public static TheoryData<string, string> Searches => new()
    {
        { "ibrahim", "ibrahim" },        // "Ibrahim", "İbrahim", "IBRAHIM", an email
        { "İBRAHİM", "ibrahim" },        // Azerbaijani capitals
        { "Ibrahım", "ibrahim" },        // dotless ı typed
        { "ИВАН", "иван" },              // Cyrillic capitals; "Иванова" too
        { "MƏMMƏDOVA", "məmmədova" },    // schwa capitals
        { "елкин", "елкин" },            // е finds ё
        { "ılqar", "ılqar" },            // ı finds I
        { "ismayılov", "ismayılov" },    // name and surname of two people
        { "Şirinov", "şirinov" },
        { "leyla", "leyla" },
    };

    [Theory]
    [MemberData(nameof(Searches))]
    public async Task Search_finds_exactly_the_events_involving_the_named_people_newest_first(string typed, string tag)
    {
        using var fixture = new SqliteTestDb();
        var data = AuditSearchDataSet.Seed(fixture.Db);
        await AssertSearch(new AuditLogService(fixture.NewContext()), data, typed, tag);
    }

    [Fact]
    public async Task The_generated_log_is_production_sized_and_unfiltered_lists_it_all()
    {
        using var fixture = new SqliteTestDb();
        AuditSearchDataSet.Seed(fixture.Db);
        var all = await new AuditLogService(fixture.NewContext()).ListAsync(new AuditLogQuery(PageSize: 50));
        Assert.Equal(AuditSearchDataSet.TotalEvents, all.TotalCount);
        Assert.True(all.TotalCount > 2_500);
    }

    // The owner's evidence: the newest event, "Leyla Məmmədova … assigned to
    // Leyla Agent" by "PolisGo Admin", came first for "ibrahim". Nothing in
    // it names an Ibrahim, so a working search must leave it out.
    [Fact]
    public async Task An_unrelated_assignment_is_not_listed_for_ibrahim()
    {
        using var fixture = new SqliteTestDb();
        var data = AuditSearchDataSet.Seed(fixture.Db);
        var unrelated = data.Events
            .Where(e => e.Involves.Contains(AuditSearchDataSet.Admin) && e.Involves.Contains(AuditSearchDataSet.LeylaAgent)
                && !e.Involves.Any(p => p.Matches("ibrahim")))
            .Select(e => e.Id)
            .ToHashSet();
        Assert.NotEmpty(unrelated);

        var ids = await AllIds(new AuditLogService(fixture.NewContext()), "ibrahim");
        Assert.Empty(ids.Intersect(unrelated));
    }

    [Fact]
    public async Task A_miss_is_zero_events()
    {
        using var fixture = new SqliteTestDb();
        AuditSearchDataSet.Seed(fixture.Db);
        var page = await new AuditLogService(fixture.NewContext()).ListAsync(new AuditLogQuery(Search: "zzzz-no-such"));
        Assert.Equal(0, page.TotalCount);
        Assert.Empty(page.Items);
    }

    // Rows saved before the SearchKey column have none until the backfill
    // runs; then they are found like any other.
    [Fact]
    public async Task The_backfill_gives_old_rows_a_key()
    {
        using var fixture = new SqliteTestDb();
        var data = AuditSearchDataSet.Seed(fixture.Db);
        await using (var raw = fixture.NewContext())
        {
            foreach (var table in new[] { "Users", "Customers", "AuditEntries" })
            {
#pragma warning disable EF1002 // constant table names, no input
                await raw.Database.ExecuteSqlRawAsync($"UPDATE {table} SET SearchKey = NULL");
#pragma warning restore EF1002
            }
        }
        Assert.Equal(0, (await new AuditLogService(fixture.NewContext())
            .ListAsync(new AuditLogQuery(Search: "Şirinov"))).TotalCount);

        await using (var db = fixture.NewContext())
        {
            var filled = await SearchKeys.BackfillAsync(db);
            Assert.True(filled >= AuditSearchDataSet.Staff.Length + AuditSearchDataSet.Clients.Length);
        }

        await AssertSearch(new AuditLogService(fixture.NewContext()), data, "Şirinov", "şirinov");
    }

    [Theory]
    [InlineData("İbrahim Şirinov", "ibrahim şirinov")]
    [InlineData("IBRAHIM", "ibrahim")]
    [InlineData("ıbrahım", "ibrahim")]
    [InlineData("i̇brahim", "ibrahim")] // JavaScript's toLowerCase("İ")
    [InlineData("MƏMMƏDOVA", "məmmədova")]
    [InlineData("Фёдор  ЁЛКИН ", "федор елкин")]
    [InlineData("ÇƏKİC ĞÖÜŞ", "çəkic ğöüş")]
    [InlineData("  ", "")]
    [InlineData(null, "")]
    public void Fold_ignores_case_the_same_way_for_every_alphabet(string? text, string folded) =>
        Assert.Equal(folded, SearchText.Fold(text));

    [Fact]
    public void A_key_keeps_its_parts_apart_and_fits_the_column()
    {
        var key = SearchText.Key("Leyla Məmmədova", "x@y.az");
        Assert.DoesNotContain("məmmədova x@", key);
        Assert.Contains("məmmədova", key);
        Assert.Equal(SearchText.KeyMaxLength, SearchText.Key(new string('a', 400), new string('b', 400)).Length);
    }

    internal static async Task AssertSearch(IAuditLogService sut, AuditSearchDataSet data, string typed, string tag)
    {
        var expected = data.Expected(tag).Select(e => e.Id).ToHashSet();
        Assert.NotEmpty(expected);

        var first = await sut.ListAsync(new AuditLogQuery(Search: typed, PageSize: 50));
        Assert.Equal(expected.Count, first.TotalCount);

        var items = await AllItems(sut, typed);
        Assert.Equal(expected.Count, items.Count);
        Assert.Equal(expected, items.Select(i => i.Id).ToHashSet());
        // Newest first across pages.
        Assert.Equal(items.OrderByDescending(i => i.OccurredAt).Select(i => i.Id), items.Select(i => i.Id));
    }

    private static async Task<HashSet<Guid>> AllIds(IAuditLogService sut, string typed) =>
        (await AllItems(sut, typed)).Select(i => i.Id).ToHashSet();

    private static async Task<List<AuditEventResponse>> AllItems(IAuditLogService sut, string typed)
    {
        var items = new List<AuditEventResponse>();
        for (var page = 1; ; page++)
        {
            var result = await sut.ListAsync(new AuditLogQuery(Search: typed, Page: page, PageSize: 50));
            items.AddRange(result.Items);
            if (result.Items.Count < 50) return items;
        }
    }
}
