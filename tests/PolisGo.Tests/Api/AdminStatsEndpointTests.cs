using System.Net;
using System.Text.Json;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class AdminStatsEndpointTests : IClassFixture<ApiFactory>
{
    private const string Url = "/api/admin/stats";
    private readonly ApiFactory _factory;

    public AdminStatsEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Anonymous_gets_401()
    {
        var response = await _factory.CreateClient().GetAsync(Url);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Client)]
    [InlineData(UserRole.Agent)]
    [InlineData(UserRole.Adjuster)]
    public async Task Non_admin_roles_get_403(UserRole role)
    {
        var response = await _factory.ClientAs(role).GetAsync(Url);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_gets_stats_with_string_enums_and_private_cache_header()
    {
        var response = await _factory.ClientAs(UserRole.Admin).GetAsync(Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.Private);
        Assert.Equal(TimeSpan.FromSeconds(60), response.Headers.CacheControl?.MaxAge);

        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal("AZN", root.GetProperty("currency").GetString());
        Assert.Equal("Draft", root.GetProperty("policies").GetProperty("byStatus")[0].GetProperty("status").GetString());
        Assert.Equal("UnderReview", root.GetProperty("claims").GetProperty("byStatus")[1].GetProperty("status").GetString());
        Assert.Equal(12, root.GetProperty("monthly").GetArrayLength());
        Assert.True(root.TryGetProperty("generatedAt", out _));
    }
}
