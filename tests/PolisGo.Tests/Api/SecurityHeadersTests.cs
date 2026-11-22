using System.Net;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// Defence in depth for an API that serves personal data and uploaded files:
// no MIME sniffing, no framing, no referrer, and nothing private cached.
public class SecurityHeadersTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    public SecurityHeadersTests(ApiFactory factory) => _factory = factory;

    private static string Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) ? string.Join(",", values)
        : response.Content.Headers.TryGetValues(name, out var content) ? string.Join(",", content)
        : "(absent)";

    private static void AssertHardened(HttpResponseMessage response)
    {
        Assert.Equal("nosniff", Header(response, "X-Content-Type-Options"));
        Assert.Equal("default-src 'none'; frame-ancestors 'none'", Header(response, "Content-Security-Policy"));
        Assert.Equal("DENY", Header(response, "X-Frame-Options"));
        Assert.Equal("no-referrer", Header(response, "Referrer-Policy"));
    }

    [Fact]
    public async Task Private_responses_and_documents_are_hardened_and_never_cached()
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var claimId = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = db.Customers.Single(c => c.Id == customerId);
            return data.Claim(data.Policy(customer, data.Vehicle(customer.Id))).Id;
        });
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]), "file", "photo.png" }
        };
        var upload = await client.PostAsync($"/api/claims/{claimId}/documents", form);
        var documentId = System.Text.Json.JsonDocument.Parse(await upload.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        foreach (var response in new[]
                 {
                     await client.GetAsync("/api/me"),
                     await client.GetAsync($"/api/claims/{claimId}/documents/{documentId}"),
                     await client.GetAsync($"/api/policies/{Guid.NewGuid()}") // a ProblemDetails 404
                 })
        {
            AssertHardened(response);
            Assert.Equal("no-store", Header(response, "Cache-Control"));
        }
    }

    [Fact]
    public async Task The_public_catalogue_keeps_its_cache_and_is_hardened()
    {
        var response = await _factory.CreateClient().GetAsync("/api/policy-types");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertHardened(response);
        Assert.Contains("max-age=300", Header(response, "Cache-Control"));
    }
}
