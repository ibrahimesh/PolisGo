using System.Net;
using System.Text.Json;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Admin;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// The audit search through HTTP over the production-sized log: the query
// string the SPA sends (percent-encoded Cyrillic and Azerbaijani, repeated
// actions), the filtered count, the order and the staff picker's search.
public class AuditSearchEndpointTests : IClassFixture<AuditSearchEndpointTests.SeededApi>
{
    public sealed class SeededApi : ApiFactory
    {
        private AuditSearchDataSet? _data;
        public AuditSearchDataSet Data => _data ??= WithDb(AuditSearchDataSet.Seed);
    }

    private readonly SeededApi _api;
    private readonly AuditSearchDataSet _data;

    public AuditSearchEndpointTests(SeededApi api)
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

    [Theory]
    [InlineData("ibrahim", "ibrahim")]
    [InlineData("İbrahim", "ibrahim")]
    [InlineData("ИВАН", "иван")]
    [InlineData("məmmədova", "məmmədova")]
    [InlineData("Ölkin", null)]
    public async Task The_count_and_rows_are_the_filtered_ones(string typed, string? tag)
    {
        var admin = _api.ClientAs(UserRole.Admin);
        // As the SPA builds it: URLSearchParams percent-encodes UTF-8.
        var body = await Get(admin, $"/api/admin/audit?search={Uri.EscapeDataString(typed)}&page=1&pageSize=25");

        var expected = tag is null ? [] : _data.Expected(tag).ToList<AuditSearchDataSet.Event>();
        Assert.Equal(expected.Count, body.GetProperty("totalCount").GetInt32());
        var items = body.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(Math.Min(25, expected.Count), items.Count);
        var expectedIds = expected.Select(e => e.Id).ToHashSet();
        Assert.All(items, item => Assert.Contains(item.GetProperty("id").GetGuid(), expectedIds));
        // The first page is the newest of the matches.
        var newest = expected.OrderByDescending(e => e.At).Take(25).Select(e => e.Id);
        Assert.Equal(newest, items.Select(i => i.GetProperty("id").GetGuid()));
    }

    [Fact]
    public async Task Without_a_search_every_event_is_counted()
    {
        var body = await Get(_api.ClientAs(UserRole.Admin), "/api/admin/audit?pageSize=1");
        // ClientAs adds no events; the data set is the whole log.
        Assert.Equal(AuditSearchDataSet.TotalEvents, body.GetProperty("totalCount").GetInt32());
    }

    // Codes the SPA matched from translated labels widen a text search
    // (OR), and an unknown code changes nothing.
    [Fact]
    public async Task Translated_action_codes_widen_the_search()
    {
        var admin = _api.ClientAs(UserRole.Admin);
        var text = (await Get(admin, "/api/admin/audit?search=%C5%9Eirinov&pageSize=1")).GetProperty("totalCount").GetInt32();
        var withCode = (await Get(admin, "/api/admin/audit?search=%C5%9Eirinov&actions=StaffCreated&actions=Nope&pageSize=1"))
            .GetProperty("totalCount").GetInt32();
        Assert.Equal(_data.Expected("şirinov").Count(), text);
        Assert.True(withCode > text);
    }

    // The Actor picker searches staff the same way.
    [Theory]
    [InlineData("ibrahim", 2)]
    [InlineData("İBRAHİM", 2)]
    [InlineData("иван", 1)]
    [InlineData("ılqar", 1)]
    public async Task The_staff_search_folds_case_too(string typed, int found)
    {
        var body = await Get(_api.ClientAs(UserRole.Admin),
            $"/api/users/staff?search={Uri.EscapeDataString(typed)}&pageSize=50");
        Assert.Equal(found, body.GetProperty("totalCount").GetInt32());
    }
}
