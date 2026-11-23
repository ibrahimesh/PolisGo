using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PolisGo.Application.Common;
using PolisGo.Application.Policies;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class PoliciesEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public PoliciesEndpointTests(ApiFactory factory) => _factory = factory;

    // Cover starts tomorrow (Baku) at the earliest.
    private static DateOnly BakuToday => BusinessCalendar.Today(TimeProvider.System);
    private static string Tomorrow => BakuToday.AddDays(1).ToString("yyyy-MM-dd");

    private static object Purchase(Guid vehicleId, string? start = null, int term = 12, string type = "MTPL") => new
    {
        vehicleId,
        policyTypeCode = type,
        startDate = start ?? Tomorrow,
        termMonths = term
    };

    // A signed-in Client with one registered vehicle.
    private (HttpClient Client, Guid CustomerId, Guid VehicleId) ClientWithVehicle()
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var vehicleId = _factory.WithDb(db => new TestData(db).Vehicle(customerId!.Value).Id);
        return (client, customerId!.Value, vehicleId);
    }

    // A policy owned by someone else, seeded directly.
    private (Guid PolicyId, string Number, string Plate) ForeignPolicy(PolicyStatus status = PolicyStatus.Active) =>
        _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var owner = data.Customer();
            var vehicle = data.Vehicle(owner.Id);
            var policy = data.Policy(owner, vehicle, status);
            return (policy.Id, policy.PolicyNumber, vehicle.PlateNumber);
        });

    // Buffered so a test can read the body after AssertProblem has.
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        await response.Content.LoadIntoBufferAsync();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await Json(response);
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Anonymous_gets_401_on_every_action()
    {
        var client = _factory.CreateClient();
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/policies")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/policies/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/policies/quote", Purchase(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/policies", Purchase(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync($"/api/policies/{id}/pay", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync($"/api/policies/{id}/cancel", null)).StatusCode);
    }

    [Fact]
    public async Task Adjuster_gets_403_on_quote_create_pay_and_cancel()
    {
        var client = _factory.ClientAs(UserRole.Adjuster);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/policies/quote", Purchase(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/policies", Purchase(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/policies/{id}/pay", null)).StatusCode);

        // A real, paid policy with a claim in the adjuster's queue: still no cancel.
        var policyId = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = data.Customer();
            var policy = data.Policy(customer, data.Vehicle(customer.Id));
            data.Claim(policy);
            return policy.Id;
        });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/policies/{policyId}/cancel", null)).StatusCode);
        Assert.Equal(PolicyStatus.Active,
            _factory.WithDb(db => db.Policies.Single(p => p.Id == policyId).Status));
    }

    // Adjusters reach a policy only through a claim they can work on (the
    // open queue or their own), the same rule as for customers.
    [Fact]
    public async Task Adjuster_sees_only_policies_with_a_claim_in_reach()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (queued, own, others, none) = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = data.Customer();
            var vehicle = data.Vehicle(customer.Id);
            var otherAdjuster = data.User(UserRole.Adjuster);
            var a = data.Policy(customer, vehicle);
            data.Claim(a);
            var b = data.Policy(customer, vehicle);
            data.Claim(b, ClaimStatus.UnderReview, adjusterId: adjusterId);
            var c = data.Policy(customer, vehicle);
            data.Claim(c, ClaimStatus.UnderReview, adjusterId: otherAdjuster.Id);
            var d = data.Policy(customer, vehicle);
            return (a.Id, b.Id, c.Id, d.Id);
        });

        var page = await Json(await adjuster.GetAsync("/api/policies?pageSize=50"));
        var ids = page.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(queued, ids);
        Assert.Contains(own, ids);
        Assert.DoesNotContain(others, ids);
        Assert.DoesNotContain(none, ids);

        Assert.Equal(HttpStatusCode.OK, (await adjuster.GetAsync($"/api/policies/{own}")).StatusCode);
        await AssertProblem(await adjuster.GetAsync($"/api/policies/{others}"), HttpStatusCode.NotFound);
        await AssertProblem(await adjuster.GetAsync($"/api/policies/{none}"), HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Quote_create_pay_and_read_the_detail()
    {
        var (client, _, vehicleId) = ClientWithVehicle();

        var quote = await Json(await client.PostAsJsonAsync("/api/policies/quote", Purchase(vehicleId)));
        var quoted = quote.GetProperty("premium").GetDecimal();

        var created = await client.PostAsJsonAsync("/api/policies", Purchase(vehicleId));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var draft = await Json(created);
        var id = draft.GetProperty("id").GetGuid();
        // The quote is the price: same stored data, same calculation.
        Assert.Equal(quoted, draft.GetProperty("premium").GetDecimal());
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        Assert.False(string.IsNullOrEmpty(draft.GetProperty("vehicle").GetProperty("plateNumber").GetString()));

        var paid = await client.PostAsync($"/api/policies/{id}/pay", null);
        Assert.Equal(HttpStatusCode.OK, paid.StatusCode);
        var receipt = await Json(paid);
        Assert.Equal("Active", receipt.GetProperty("policy").GetProperty("status").GetString());

        var detail = await Json(await client.GetAsync($"/api/policies/{id}"));
        Assert.Equal("Active", detail.GetProperty("policy").GetProperty("status").GetString());
        Assert.Equal("Client User", detail.GetProperty("holderName").GetString());
        Assert.Equal(quote.GetProperty("totalFactor").GetDecimal(), detail.GetProperty("pricing").GetProperty("totalFactor").GetDecimal());
        Assert.Equal(quoted, detail.GetProperty("pricing").GetProperty("premium").GetDecimal());
        Assert.Equal(receipt.GetProperty("reference").GetString(),
            detail.GetProperty("payments")[0].GetProperty("reference").GetString());
        var history = detail.GetProperty("history").EnumerateArray()
            .Select(h => h.GetProperty("toStatus").GetString()).ToList();
        Assert.Equal(["Draft", "Active"], history);
    }

    // IDOR: a client must not reach another client's policy by guessing its id.
    [Fact]
    public async Task Client_cannot_read_pay_or_cancel_another_clients_policy()
    {
        var (client, _, _) = ClientWithVehicle();
        var (foreignId, number, plate) = ForeignPolicy(PolicyStatus.Draft);

        await AssertProblem(await client.GetAsync($"/api/policies/{foreignId}"), HttpStatusCode.NotFound);
        await AssertProblem(await client.PostAsync($"/api/policies/{foreignId}/pay", null), HttpStatusCode.NotFound);
        await AssertProblem(await client.PostAsync($"/api/policies/{foreignId}/cancel", null), HttpStatusCode.NotFound);

        // Not via the list or its search either.
        foreach (var term in new[] { number, plate })
        {
            var page = await Json(await client.GetAsync($"/api/policies?search={Uri.EscapeDataString(term)}"));
            Assert.Equal(0, page.GetProperty("totalCount").GetInt32());
        }

        // The 404 is the same as for an id that doesn't exist at all.
        await AssertProblem(await client.GetAsync($"/api/policies/{Guid.NewGuid()}"), HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Client_cannot_buy_cover_for_another_clients_vehicle()
    {
        var (client, _, _) = ClientWithVehicle();
        var foreignVehicle = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            return data.Vehicle(data.Customer().Id).Id;
        });

        await AssertProblem(await client.PostAsJsonAsync("/api/policies/quote", Purchase(foreignVehicle)), HttpStatusCode.NotFound);
        await AssertProblem(await client.PostAsJsonAsync("/api/policies", Purchase(foreignVehicle)), HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Quote_validates_dates_and_term_with_field_errors()
    {
        var (client, _, vehicleId) = ClientWithVehicle();
        var today = BakuToday.ToString("yyyy-MM-dd");

        var response = await client.PostAsJsonAsync("/api/policies/quote", Purchase(vehicleId, start: today, term: 13));

        await AssertProblem(response, HttpStatusCode.BadRequest);
        var errors = (await Json(response)).GetProperty("errors");
        Assert.Equal(PolicyValidation.Messages.StartDateTooEarly, errors.GetProperty("StartDate")[0].GetString());
        Assert.Equal(PolicyValidation.Messages.TermOutOfRange, errors.GetProperty("TermMonths")[0].GetString());
    }

    [Fact]
    public async Task Overlapping_cover_is_a_409_on_quote_as_well_as_create()
    {
        var (client, _, vehicleId) = ClientWithVehicle();
        (await client.PostAsJsonAsync("/api/policies", Purchase(vehicleId))).EnsureSuccessStatusCode();

        var quote = await client.PostAsJsonAsync("/api/policies/quote", Purchase(vehicleId));
        await AssertProblem(quote, HttpStatusCode.Conflict);
        Assert.Equal(PolicyValidation.Messages.Overlap, (await Json(quote)).GetProperty("detail").GetString());
    }

    // Reproduces a backdating hole: a draft created days ago could be paid
    // today and become cover that started before the payment.
    [Fact]
    public async Task A_draft_whose_start_date_has_passed_cannot_be_paid()
    {
        var (client, customerId, vehicleId) = ClientWithVehicle();
        var draftId = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = db.Customers.Single(c => c.Id == customerId);
            var vehicle = db.Vehicles.Single(v => v.Id == vehicleId);
            return data.Policy(customer, vehicle, PolicyStatus.Draft, createdAt: DateTime.UtcNow.AddDays(-3)).Id;
        });

        var response = await client.PostAsync($"/api/policies/{draftId}/pay", null);

        await AssertProblem(response, HttpStatusCode.Conflict);
        Assert.Equal(PolicyValidation.Messages.DraftStartPassed, (await Json(response)).GetProperty("detail").GetString());
    }

    // Reproduces: nothing ever set Expired, so lapsed cover kept reading Active.
    [Fact]
    public async Task An_active_policy_past_its_end_date_reads_and_filters_as_expired()
    {
        var (client, customerId, vehicleId) = ClientWithVehicle();
        var (lapsedId, currentId) = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = db.Customers.Single(c => c.Id == customerId);
            var vehicle = db.Vehicles.Single(v => v.Id == vehicleId);
            var lapsed = data.Policy(customer, vehicle, PolicyStatus.Active, createdAt: DateTime.UtcNow.AddYears(-2));
            var current = data.Policy(customer, vehicle, PolicyStatus.Active, cascoType: true);
            return (lapsed.Id, current.Id);
        });

        var detail = await Json(await client.GetAsync($"/api/policies/{lapsedId}"));
        Assert.Equal("Expired", detail.GetProperty("policy").GetProperty("status").GetString());
        var last = detail.GetProperty("history").EnumerateArray().Last();
        Assert.Equal("Expired", last.GetProperty("toStatus").GetString());
        Assert.True(last.GetProperty("automatic").GetBoolean());

        var expired = await Json(await client.GetAsync("/api/policies?status=Expired"));
        Assert.Equal([lapsedId], expired.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("id").GetGuid()));
        var active = await Json(await client.GetAsync("/api/policies?status=Active"));
        Assert.Equal([currentId], active.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("id").GetGuid()));

        await AssertProblem(await client.PostAsync($"/api/policies/{lapsedId}/cancel", null), HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task List_filters_by_type_searches_by_plate_and_sorts_by_premium()
    {
        var (client, customerId, vehicleId) = ClientWithVehicle();
        var plate = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = db.Customers.Single(c => c.Id == customerId);
            var vehicle = db.Vehicles.Single(v => v.Id == vehicleId);
            var other = data.Vehicle(customerId);
            data.Policy(customer, vehicle, premium: 300m);
            data.Policy(customer, vehicle, premium: 120m, cascoType: true);
            data.Policy(customer, other, premium: 90m);
            return vehicle.PlateNumber;
        });

        var mtpl = await Json(await client.GetAsync("/api/policies?type=mtpl&sortBy=premium&sortDir=asc"));
        Assert.Equal([90m, 300m], mtpl.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("premium").GetDecimal()));

        var byPlate = await Json(await client.GetAsync($"/api/policies?search={plate.ToLowerInvariant()}&sortBy=premium&sortDir=desc"));
        Assert.Equal([300m, 120m], byPlate.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("premium").GetDecimal()));
    }

    [Fact]
    public async Task List_rejects_bad_input_and_caps_page_size()
    {
        var client = _factory.ClientAs(UserRole.Client);

        await AssertProblem(await client.GetAsync("/api/policies?sortBy=customer"), HttpStatusCode.BadRequest);
        await AssertProblem(await client.GetAsync("/api/policies?status=Lost"), HttpStatusCode.BadRequest);
        var tooLong = await client.GetAsync($"/api/policies?search={new string('x', 101)}");
        await AssertProblem(tooLong, HttpStatusCode.BadRequest);
        Assert.Equal(PolicyValidation.Messages.SearchTooLong,
            (await Json(tooLong)).GetProperty("errors").GetProperty("search")[0].GetString());

        var page = await Json(await client.GetAsync("/api/policies?pageSize=500"));
        Assert.Equal(50, page.GetProperty("pageSize").GetInt32());
    }
}
