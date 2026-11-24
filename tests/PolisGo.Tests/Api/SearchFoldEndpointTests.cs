using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;
using PolisGo.Tests.Search;

namespace PolisGo.Tests.Api;

// Every list's search through HTTP: the query string the SPA sends
// (percent-encoded Azerbaijani and Cyrillic), the filtered count and the rows,
// the CSV exports that reuse the list's filter, and an agent's book.
public class SearchFoldEndpointTests : IClassFixture<SearchFoldEndpointTests.SeededApi>
{
    public sealed class SeededApi : ApiFactory
    {
        private SearchFoldDataSet? _data;
        internal SearchFoldDataSet Data => _data ??= WithDb(SearchFoldDataSet.Seed);
    }

    private readonly SeededApi _api;
    private readonly SearchFoldDataSet _data;

    public SearchFoldEndpointTests(SeededApi api)
    {
        _api = api;
        _data = api.Data;
    }

    private static async Task<JsonElement> Get(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static void AssertTags(JsonElement page, IReadOnlyDictionary<Guid, string> tags, string[] expected)
    {
        Assert.Equal(expected.Length, page.GetProperty("totalCount").GetInt32());
        var found = page.GetProperty("items").EnumerateArray()
            .Select(i => tags.TryGetValue(i.GetProperty("id").GetGuid(), out var tag) ? tag : "(other)");
        Assert.Equal(expected.Order(), found.Order());
    }

    private static string Q(string typed) => Uri.EscapeDataString(typed);

    [Theory]
    [InlineData("İBRAHİM", new[] { "ibrahim" })]
    [InlineData("ıbrahım", new[] { "ibrahim" })]
    [InlineData("çələbi", new[] { "ilqar" })]
    [InlineData("GÜLNARƏ", new[] { "gulnare" })]
    [InlineData("ƏLİYEV", new[] { "omer" })]
    [InlineData("ОЛЬГА", new[] { "olga" })]
    [InlineData("алена", new[] { "alena" })]
    [InlineData("yev", new[] { "gulnare", "omer", "rauf", "ulviyye" })]
    [InlineData("zzz", new string[0])]
    public async Task Every_list_finds_the_named_people(string typed, string[] expected)
    {
        var admin = _api.ClientAs(UserRole.Admin);
        AssertTags(await Get(admin, $"/api/claims?search={Q(typed)}&pageSize=50"), _data.ClaimTags, expected);
        AssertTags(await Get(admin, $"/api/policies?search={Q(typed)}&pageSize=50"), _data.PolicyTags, expected);
        AssertTags(await Get(admin, $"/api/customers?search={Q(typed)}&pageSize=50"), _data.CustomerTags, expected);
        AssertTags(await Get(admin, $"/api/users/staff?search={Q(typed)}&pageSize=50"), _data.StaffTags, expected);
    }

    [Theory]
    [InlineData("НЕ УДАЛОСЬ", new[] { "ru" })]
    [InlineData("ŞƏKİL", new[] { "az" })]
    [InlineData("ödəniş", new[] { "az" })]
    public async Task Error_groups_are_found_in_any_language(string typed, string[] expected) =>
        AssertTags(await Get(_api.ClientAs(UserRole.Admin), $"/api/admin/errors?search={Q(typed)}&pageSize=50"),
            _data.ErrorTags, expected);

    [Theory]
    [InlineData("pg-2026-sf002", "gulnare")]
    [InlineData("77-ıb-000", "ibrahim")]
    public async Task Numbers_and_plates_are_found_in_any_case(string typed, string tag) =>
        AssertTags(await Get(_api.ClientAs(UserRole.Admin), $"/api/policies?search={Q(typed)}"), _data.PolicyTags, [tag]);

    // The exports reuse the list's filter: same people, one CSV line each.
    [Fact]
    public async Task Exports_use_the_same_search()
    {
        var admin = _api.ClientAs(UserRole.Admin);
        foreach (var url in new[] { "/api/claims/export", "/api/policies/export" })
        {
            var response = await admin.GetAsync($"{url}?search={Q("YEV")}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var lines = (await response.Content.ReadAsStringAsync()).Split('\n', StringSplitOptions.RemoveEmptyEntries);
            Assert.Equal(1 + 4, lines.Length);
            Assert.Contains(lines, l => l.Contains("Ülviyyə Hacıyeva"));
            Assert.Contains(lines, l => l.Contains("Ömər Əliyev"));
        }
    }

    // An agent's book: the search folds the same way inside it, and never
    // reaches past it.
    [Fact]
    public async Task An_agent_searches_only_their_book()
    {
        var agent = _api.ClientAs(UserRole.Agent, out var agentId, out _);
        var olga = _data.CustomerTags.Single(c => c.Value == "olga").Key;
        await _api.WithDbAsync(db => db.Customers.Where(c => c.Id == olga)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.AgentId, agentId)));

        AssertTags(await Get(agent, $"/api/customers?search={Q("ОЛЬГА")}"), _data.CustomerTags, ["olga"]);
        AssertTags(await Get(agent, $"/api/customers?search={Q("İBRAHİM")}"), _data.CustomerTags, []);
    }
}
