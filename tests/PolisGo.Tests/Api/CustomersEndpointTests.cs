using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class CustomersEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public CustomersEndpointTests(ApiFactory factory) => _factory = factory;

    private Guid SeedCustomer(string name = "Nigar Quliyeva") =>
        _factory.WithDb(db => new TestData(db).Customer(fullName: name).Id);

    [Fact]
    public async Task Anonymous_gets_401_on_list_and_detail()
    {
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/customers")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/customers/{SeedCustomer()}")).StatusCode);
    }

    [Fact]
    public async Task Client_gets_403_even_for_their_own_customer_record()
    {
        var client = _factory.ClientAs(UserRole.Client, out var ownCustomerId);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/customers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/customers/{ownCustomerId}")).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Admin)]
    [InlineData(UserRole.Agent)]
    [InlineData(UserRole.Adjuster)]
    public async Task Staff_can_list_and_open_customers(UserRole role)
    {
        var id = SeedCustomer($"Staff View {role}");
        var client = _factory.ClientAs(role);

        var list = await client.GetAsync($"/api/customers?search=Staff%20View%20{role}&sortBy=fullName&sortDir=asc");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var page = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(id, page.RootElement.GetProperty("items")[0].GetProperty("id").GetGuid());

        var detail = await client.GetAsync($"/api/customers/{id}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var body = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
        Assert.Equal("Submitted", body.RootElement.GetProperty("claims").GetProperty("byStatus")[0].GetProperty("status").GetString());
        Assert.Equal("1990-05-01", body.RootElement.GetProperty("birthDate").GetString());
    }

    [Fact]
    public async Task Page_size_is_capped_at_50()
    {
        var response = await _factory.ClientAs(UserRole.Admin).GetAsync("/api/customers?pageSize=500");
        using var page = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(50, page.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task Invalid_sort_value_is_a_400_problem()
    {
        var response = await _factory.ClientAs(UserRole.Admin).GetAsync("/api/customers?sortBy=password");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Overlong_search_is_a_400_problem_with_trace_id()
    {
        var response = await _factory.ClientAs(UserRole.Admin).GetAsync($"/api/customers?search={new string('x', 101)}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("search", out _));
        Assert.False(string.IsNullOrEmpty(problem.RootElement.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Unknown_customer_is_a_404_problem()
    {
        var response = await _factory.ClientAs(UserRole.Agent).GetAsync($"/api/customers/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(404, problem.RootElement.GetProperty("status").GetInt32());
        Assert.True(problem.RootElement.TryGetProperty("traceId", out _));
    }

    [Fact]
    public async Task Client_still_sees_only_their_own_vehicles_elsewhere()
    {
        var client = _factory.ClientAs(UserRole.Client, out var ownCustomerId);
        var (ownVehicle, foreignVehicle) = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var other = data.Customer();
            return (data.Vehicle(ownCustomerId!.Value).Id, data.Vehicle(other.Id).Id);
        });

        var vehicles = await client.GetFromJsonAsync<JsonElement>("/api/vehicles");
        var ids = vehicles.EnumerateArray().Select(v => v.GetProperty("id").GetGuid()).ToList();

        Assert.Contains(ownVehicle, ids);
        Assert.DoesNotContain(foreignVehicle, ids);
    }
}
