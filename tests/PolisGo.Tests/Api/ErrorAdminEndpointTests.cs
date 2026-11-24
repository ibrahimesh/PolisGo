using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// The System section's API: Admin only (401 anonymous, 403 for every other
// role), ProblemDetails for 404 and 409, and a health answer with nothing a
// secret could hide in.
public class ErrorAdminEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    public ErrorAdminEndpointTests(ApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.False(string.IsNullOrEmpty((await Json(response)).GetProperty("traceId").GetString()));
    }

    public static TheoryData<string, string> Endpoints => new()
    {
        { "GET", "/api/admin/errors" },
        { "GET", "/api/admin/errors/summary" },
        { "GET", "/api/admin/errors/lookup?reference=8F05E497" },
        { "GET", $"/api/admin/errors/{Guid.Empty}" },
        { "PATCH", $"/api/admin/errors/{Guid.Empty}" },
        { "DELETE", "/api/admin/errors/resolved?olderThanDays=30" },
        { "GET", "/api/admin/system/health" },
    };

    private static HttpRequestMessage Request(string method, string url) => new(new HttpMethod(method), url)
    {
        Content = method == "PATCH" ? JsonContent.Create(new { status = "Resolved", rowVersion = Guid.Empty }) : null
    };

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Anonymous_callers_get_401(string method, string url)
    {
        var response = await _factory.CreateClient().SendAsync(Request(method, url));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Every_role_but_admin_gets_403(string method, string url)
    {
        foreach (var role in new[] { UserRole.Client, UserRole.Agent, UserRole.Adjuster })
        {
            var response = await _factory.ClientAs(role).SendAsync(Request(method, url));
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{role} {method} {url}: {response.StatusCode}");
        }
    }

    [Fact]
    public async Task An_admin_finds_a_500_by_its_reference_resolves_it_and_sees_it_regress()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var failure = await _factory.CreateClient().PostAsync("/api/diagnostics/test-failure", null);
        var traceId = ErrorReference.TraceIdOf((await Json(failure)).GetProperty("traceId").GetString())!;
        var code = traceId[..8].ToUpperInvariant();
        await _factory.DrainErrorsAsync();

        var lookup = await Json(await admin.GetAsync($"/api/admin/errors/lookup?reference={code[..4]}-{code[4..].ToLowerInvariant()}"));
        Assert.Equal(code, lookup.GetProperty("occurrence").GetProperty("referenceCode").GetString());
        var id = lookup.GetProperty("group").GetProperty("id").GetGuid();

        var listed = await Json(await admin.GetAsync($"/api/admin/errors?search={code}"));
        Assert.Equal(1, listed.GetProperty("totalCount").GetInt32());

        var detail = await Json(await admin.GetAsync($"/api/admin/errors/{id}"));
        var rowVersion = detail.GetProperty("rowVersion").GetGuid();
        var resolve = await admin.PatchAsJsonAsync($"/api/admin/errors/{id}",
            new { status = "Resolved", note = "Fixed", rowVersion });
        Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        // The version it was resolved from is stale now: 409 "Concurrent update".
        var stale = await admin.PatchAsJsonAsync($"/api/admin/errors/{id}", new { status = "Ignored", rowVersion });
        await AssertProblem(stale, HttpStatusCode.Conflict);
        Assert.Equal("Concurrent update", (await Json(stale)).GetProperty("title").GetString());

        await _factory.CreateClient().PostAsync("/api/diagnostics/test-failure", null);
        await _factory.DrainErrorsAsync();
        var regressed = await Json(await admin.GetAsync($"/api/admin/errors/{id}"));
        Assert.Equal("New", regressed.GetProperty("status").GetString());
        Assert.True(regressed.GetProperty("isRegressed").GetBoolean());

        var audit = await Json(await admin.GetAsync("/api/admin/audit?entityType=Error"));
        Assert.Contains(audit.GetProperty("items").EnumerateArray(),
            e => e.GetProperty("entityId").GetGuid() == id && e.GetProperty("action").GetString() == "ErrorResolved");
    }

    [Fact]
    public async Task Unknown_ids_and_references_are_404_and_bad_input_400()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        await AssertProblem(await admin.GetAsync($"/api/admin/errors/{Guid.NewGuid()}"), HttpStatusCode.NotFound);
        await AssertProblem(await admin.GetAsync("/api/admin/errors/lookup?reference=00000000"), HttpStatusCode.NotFound);
        await AssertProblem(await admin.GetAsync("/api/admin/errors/lookup?reference=hello"), HttpStatusCode.BadRequest);
        await AssertProblem(await admin.DeleteAsync("/api/admin/errors/resolved?olderThanDays=0"), HttpStatusCode.BadRequest);
        await AssertProblem(await admin.GetAsync($"/api/admin/errors?search={new string('x', 101)}"), HttpStatusCode.BadRequest);
        await AssertProblem(await admin.PatchAsJsonAsync($"/api/admin/errors/{Guid.NewGuid()}",
            new { status = "Resolved", rowVersion = Guid.Empty }), HttpStatusCode.NotFound);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/errors/summary")).StatusCode);
    }

    // Names of things, numbers and the migration state; nothing from
    // configuration (the test host's JWT key and connection string are known).
    [Fact]
    public async Task Health_reports_state_without_secrets()
    {
        var response = await _factory.ClientAs(UserRole.Admin).GetAsync("/api/admin/system/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        var health = JsonDocument.Parse(text).RootElement;

        Assert.Equal("Testing", health.GetProperty("environment").GetString());
        Assert.True(health.GetProperty("database").GetProperty("reachable").GetBoolean());
        Assert.True(health.GetProperty("database").GetProperty("roundTripMs").GetDouble() >= 0);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", health.GetProperty("serverTimeBaku").GetString());
        Assert.True(health.GetProperty("uptimeSeconds").GetInt64() >= 0);
        foreach (var secret in new[] { "integration-tests-signing-key", "Server=", "Database=", "Password", "DataSource" })
        {
            Assert.DoesNotContain(secret, text, StringComparison.OrdinalIgnoreCase);
        }
    }
}
