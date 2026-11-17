using System.Net;
using System.Text.Json;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class PolicyTypesEndpointTests : IClassFixture<ApiFactory>
{
    private const string Url = "/api/policy-types";
    private readonly ApiFactory _factory;

    public PolicyTypesEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Anonymous_gets_the_catalogue_with_a_public_cache_header()
    {
        var response = await _factory.CreateClient().GetAsync(Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.Public);
        Assert.Equal(TimeSpan.FromMinutes(5), response.Headers.CacheControl?.MaxAge);

        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var codes = json.RootElement.EnumerateArray().Select(t => t.GetProperty("code").GetString()).ToList();
        Assert.Equal(new[] { "CASCO", "MTPL" }, codes);
        var first = json.RootElement[0];
        Assert.Equal("Comprehensive Auto (CASCO)", first.GetProperty("name").GetString());
        Assert.Equal(250m, first.GetProperty("baseRate").GetDecimal());
        Assert.Equal("AZN", first.GetProperty("currency").GetString());
    }

    [Theory]
    [InlineData(UserRole.Client)]
    [InlineData(UserRole.Admin)]
    public async Task Authenticated_users_get_it_too(UserRole role)
    {
        var response = await _factory.ClientAs(role).GetAsync(Url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
