using System.Net;
using System.Text.Json;
using PolisGo.Application.Common;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class CabinetEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public CabinetEndpointTests(ApiFactory factory) => _factory = factory;

    private static readonly string[] ClientOnlyGets = ["/api/me/overview", "/api/me/reminders"];

    // TestData policies run a year from createdAt, so this makes the last
    // covered day `daysLeft` days from today.
    private static DateTime CreatedForDaysLeft(int daysLeft) => TestDates.TodayStart.AddYears(-1).AddDays(daysLeft + 1);

    private sealed record Seeded(HttpClient Client, Customer Customer, Vehicle Vehicle);

    private Seeded ClientWithVehicle()
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var (customer, vehicle) = _factory.WithDb(db =>
        {
            var customer = db.Customers.Single(c => c.Id == customerId);
            return (customer, new TestData(db).Vehicle(customer.Id));
        });
        return new Seeded(client, customer, vehicle);
    }

    private Policy Seed(Seeded s, PolicyStatus status, DateTime createdAt, bool casco = false, Vehicle? vehicle = null,
        DateTime? startDate = null) =>
        _factory.WithDb(db => new TestData(db).Policy(s.Customer, vehicle ?? s.Vehicle, status, createdAt, cascoType: casco,
            startDate: startDate));

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    [Fact]
    public async Task Anonymous_gets_401()
    {
        var client = _factory.CreateClient();
        foreach (var url in ClientOnlyGets)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/me/reminders/read-all", null)).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Agent)]
    [InlineData(UserRole.Adjuster)]
    [InlineData(UserRole.Admin)]
    public async Task Staff_get_403(UserRole role)
    {
        var client = _factory.ClientAs(role);
        foreach (var url in ClientOnlyGets)
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/me/reminders/{Guid.NewGuid()}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/me/reminders/read-all", null)).StatusCode);
    }

    [Fact]
    public async Task A_new_client_gets_an_empty_overview()
    {
        var overview = await Json(await _factory.ClientAs(UserRole.Client).GetAsync("/api/me/overview"));

        Assert.Equal(0, overview.GetProperty("activePolicies").GetInt32());
        Assert.Equal(JsonValueKind.Null, overview.GetProperty("nextRenewal").ValueKind);
        Assert.Equal(0m, overview.GetProperty("paidLast12Months").GetDecimal());
        Assert.Equal("AZN", overview.GetProperty("currency").GetString());
        Assert.Empty(overview.GetProperty("recentActivity").EnumerateArray());
    }

    [Fact]
    public async Task Reminders_cover_active_policies_ending_within_30_days()
    {
        var s = ClientWithVehicle();
        var second = _factory.WithDb(db => new TestData(db).Vehicle(s.Customer.Id));
        var third = _factory.WithDb(db => new TestData(db).Vehicle(s.Customer.Id));
        var soon = Seed(s, PolicyStatus.Active, CreatedForDaysLeft(10));
        var lastDay = Seed(s, PolicyStatus.Active, CreatedForDaysLeft(0), casco: true);
        Seed(s, PolicyStatus.Active, CreatedForDaysLeft(31), vehicle: second);      // outside the window
        Seed(s, PolicyStatus.Active, CreatedForDaysLeft(-1), vehicle: third);       // already expired
        Seed(s, PolicyStatus.Cancelled, CreatedForDaysLeft(5), casco: true, vehicle: second);

        var reminders = (await Json(await s.Client.GetAsync("/api/me/reminders"))).EnumerateArray().ToList();

        Assert.Equal([lastDay.Id, soon.Id], reminders.Select(r => r.GetProperty("policyId").GetGuid()));
        Assert.Equal([0, 10], reminders.Select(r => r.GetProperty("daysLeft").GetInt32()));
        Assert.All(reminders, r => Assert.Equal(JsonValueKind.Null, r.GetProperty("readAt").ValueKind));
    }

    [Fact]
    public async Task A_renewal_clears_the_reminder()
    {
        var s = ClientWithVehicle();
        var ending = Seed(s, PolicyStatus.Active, CreatedForDaysLeft(7));
        Assert.Single((await Json(await s.Client.GetAsync("/api/me/reminders"))).EnumerateArray());

        // Follow-on draft starting the day after the old one ends.
        _factory.WithDb(db => new TestData(db).Policy(s.Customer, s.Vehicle, PolicyStatus.Draft, ending.EndDate.AddDays(1)));

        Assert.Empty((await Json(await s.Client.GetAsync("/api/me/reminders"))).EnumerateArray());
    }

    [Fact]
    public async Task Marking_read_is_idempotent_and_counts_in_the_overview()
    {
        var s = ClientWithVehicle();
        var first = Seed(s, PolicyStatus.Active, CreatedForDaysLeft(3));
        Seed(s, PolicyStatus.Active, CreatedForDaysLeft(20), casco: true);
        Assert.Equal(2, (await Json(await s.Client.GetAsync("/api/me/overview"))).GetProperty("unreadReminders").GetInt32());

        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync($"/api/me/reminders/{first.Id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync($"/api/me/reminders/{first.Id}/read", null)).StatusCode);
        Assert.Equal(1, (await Json(await s.Client.GetAsync("/api/me/overview"))).GetProperty("unreadReminders").GetInt32());

        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync("/api/me/reminders/read-all", null)).StatusCode);
        var reminders = (await Json(await s.Client.GetAsync("/api/me/reminders"))).EnumerateArray().ToList();
        Assert.All(reminders, r => Assert.NotEqual(JsonValueKind.Null, r.GetProperty("readAt").ValueKind));
    }

    [Fact]
    public async Task A_client_cannot_mark_another_clients_policy()
    {
        var s = ClientWithVehicle();
        var foreign = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var owner = data.Customer();
            return data.Policy(owner, data.Vehicle(owner.Id), PolicyStatus.Active, CreatedForDaysLeft(5)).Id;
        });

        var response = await s.Client.PostAsync($"/api/me/reminders/{foreign}/read", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Overview_counts_effective_statuses_payments_and_activity()
    {
        var s = ClientWithVehicle();
        var spare = _factory.WithDb(db => new TestData(db).Vehicle(s.Customer.Id));
        var active = Seed(s, PolicyStatus.Active, CreatedForDaysLeft(40));
        Seed(s, PolicyStatus.Active, CreatedForDaysLeft(-3), casco: true);         // lapsed: not active
        Seed(s, PolicyStatus.Draft, DateTime.UtcNow, vehicle: spare,
            startDate: BusinessCalendar.Today(TimeProvider.System).AddDays(1).ToDateTime(TimeOnly.MinValue)); // payable: starts tomorrow
        Seed(s, PolicyStatus.Draft, DateTime.UtcNow.AddDays(-5), casco: true, vehicle: spare); // stale draft
        _factory.WithDb(db =>
        {
            var data = new TestData(db);
            data.Payment(db.Policies.Single(p => p.Id == active.Id), 150.50m);
            // History row as the API would write it on payment.
            db.PolicyStatusHistory.Add(new PolicyStatusHistory
            {
                PolicyId = active.Id, FromStatus = PolicyStatus.Draft, ToStatus = PolicyStatus.Active,
                ChangedByUserId = null, ChangedAt = DateTime.UtcNow
            });
            return db.SaveChanges();
        });

        var overview = await Json(await s.Client.GetAsync("/api/me/overview"));

        Assert.Equal(1, overview.GetProperty("activePolicies").GetInt32());
        Assert.Equal(1, overview.GetProperty("awaitingPayment").GetInt32());
        Assert.Equal(1, overview.GetProperty("insuredVehicles").GetInt32());
        Assert.Equal(2, overview.GetProperty("vehicles").GetInt32());
        Assert.Equal(150.50m, overview.GetProperty("paidLast12Months").GetDecimal());
        Assert.Equal(active.Id, overview.GetProperty("nextRenewal").GetProperty("policyId").GetGuid());
        Assert.Equal(40, overview.GetProperty("nextRenewal").GetProperty("daysLeft").GetInt32());
        var latest = overview.GetProperty("recentActivity")[0];
        Assert.Equal("Policy", latest.GetProperty("kind").GetString());
        Assert.Equal("Active", latest.GetProperty("toStatus").GetString());
    }
}
