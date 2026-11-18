using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using PolisGo.Application.Claims;
using PolisGo.Application.Common;
using PolisGo.Application.Customers;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// The staff panel's server side: role gates, the agent's own book, the
// adjuster's reach, decisions with their field rules and optimistic
// concurrency, the CSV exports and the overview.
public class StaffEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public StaffEndpointTests(ApiFactory factory) => _factory = factory;

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
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    private static async Task AssertFieldError(HttpResponseMessage response, string field, string message)
    {
        await AssertProblem(response, HttpStatusCode.BadRequest);
        var problem = await Json(response);
        Assert.Equal(message, problem.GetProperty("errors").GetProperty(field)[0].GetString());
    }

    // A customer (optionally in an agent's book) with an active policy and a claim.
    private (Customer Customer, Policy Policy, Claim Claim) Seed(
        Guid? agentId = null,
        ClaimStatus status = ClaimStatus.Submitted,
        Guid? adjusterId = null,
        string name = "Aysel Hasanova",
        decimal claimed = 500m)
    {
        return _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var customer = data.Customer(fullName: name, agentId: agentId);
            var policy = data.Policy(customer, data.Vehicle(customer.Id), agentId: agentId,
                createdAt: DateTime.UtcNow.AddMonths(-1));
            var claim = data.Claim(policy, status, claimed: claimed, adjusterId: adjusterId);
            return (customer, policy, claim);
        });
    }

    private Guid RowVersion(Guid claimId) =>
        _factory.WithDb(db => db.Claims.Single(c => c.Id == claimId).RowVersion);

    // ---------- Role gates ----------

    public static TheoryData<string, string> StaffEndpoints() => new()
    {
        { "GET", "/api/customers" },
        { "GET", $"/api/customers/{Guid.NewGuid()}" },
        { "PUT", $"/api/customers/{Guid.NewGuid()}/agent" },
        { "GET", "/api/staff/overview" },
        { "GET", "/api/claims/export" },
        { "GET", "/api/policies/export" },
        { "POST", $"/api/claims/{Guid.NewGuid()}/review" },
        { "POST", $"/api/claims/{Guid.NewGuid()}/approve" },
        { "POST", $"/api/claims/{Guid.NewGuid()}/reject" },
        { "POST", $"/api/claims/{Guid.NewGuid()}/pay" },
    };

    private static HttpRequestMessage Request(string method, string url) =>
        new(new HttpMethod(method), url)
        {
            Content = method == "GET" ? null : JsonContent.Create(new { comment = "x", approvedAmount = 1m })
        };

    [Theory]
    [MemberData(nameof(StaffEndpoints))]
    public async Task Anonymous_gets_401_on_every_staff_endpoint(string method, string url)
    {
        var response = await _factory.CreateClient().SendAsync(Request(method, url));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(StaffEndpoints))]
    public async Task A_client_gets_403_on_every_staff_endpoint(string method, string url)
    {
        var response = await _factory.ClientAs(UserRole.Client).SendAsync(Request(method, url));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("review")]
    [InlineData("approve")]
    [InlineData("reject")]
    [InlineData("pay")]
    public async Task An_agent_cannot_decide_even_a_claim_on_their_own_sale(string action)
    {
        var agent = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        var (_, _, claim) = Seed(agentId);

        var response = await agent.SendAsync(Request("POST", $"/api/claims/{claim.Id}/{action}"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(ClaimStatus.Submitted, _factory.WithDb(db => db.Claims.Single(c => c.Id == claim.Id).Status));
    }

    [Theory]
    [InlineData(UserRole.Agent, "/api/claims/export")]
    [InlineData(UserRole.Adjuster, "/api/policies/export")]
    public async Task Each_desk_exports_only_its_own_list(UserRole role, string url)
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientAs(role).GetAsync(url)).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.Agent)]
    [InlineData(UserRole.Adjuster)]
    public async Task Only_an_admin_assigns_customers_to_agents(UserRole role)
    {
        var (customer, _, _) = Seed();
        var response = await _factory.ClientAs(role)
            .PutAsJsonAsync($"/api/customers/{customer.Id}/agent", new { agentId = (Guid?)null });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_adjuster_cannot_register_vehicles()
    {
        var response = await _factory.ClientAs(UserRole.Adjuster).PostAsJsonAsync("/api/vehicles", new { });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---------- The agent's own book ----------

    [Fact]
    public async Task An_agent_sees_only_their_own_customers()
    {
        var agent = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        _factory.ClientAs(UserRole.Agent, out var otherAgentId, out _);
        var (mine, _, _) = Seed(agentId, name: "Book Mine Leyla");
        var (theirs, theirPolicy, _) = Seed(otherAgentId, name: "Book Theirs Leyla");
        var vehicleId = _factory.WithDb(db => db.Policies.Single(p => p.Id == theirPolicy.Id).VehicleId);

        var page = await Json(await agent.GetAsync("/api/customers?search=Book%20"));
        var ids = page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()).ToList();
        Assert.Equal([mine.Id], ids);

        Assert.Equal(HttpStatusCode.OK, (await agent.GetAsync($"/api/customers/{mine.Id}")).StatusCode);
        await AssertProblem(await agent.GetAsync($"/api/customers/{theirs.Id}"), HttpStatusCode.NotFound);

        // No side doors: their vehicles, a vehicle for them, a quote, a sale.
        var vehicles = await Json(await agent.GetAsync($"/api/vehicles?customerId={theirs.Id}"));
        Assert.Equal(0, vehicles.GetArrayLength());
        var newVehicle = await agent.PostAsJsonAsync("/api/vehicles", new
        {
            make = "Kia", model = "Rio", year = 2021, engineCapacityCc = 1400,
            plateNumber = $"77-ZZ-{Random.Shared.Next(100, 999)}", vin = "1HGBH41JXMN109186",
            customerId = theirs.Id
        });
        await AssertProblem(newVehicle, HttpStatusCode.NotFound);
        var sale = new
        {
            vehicleId, policyTypeCode = "CASCO", termMonths = 12, customerId = theirs.Id,
            startDate = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd")
        };
        await AssertProblem(await agent.PostAsJsonAsync("/api/policies/quote", sale), HttpStatusCode.NotFound);
        await AssertProblem(await agent.PostAsJsonAsync("/api/policies", sale), HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_agent_cannot_file_a_claim_on_another_agents_policy()
    {
        var agent = _factory.ClientAs(UserRole.Agent, out _, out _);
        _factory.ClientAs(UserRole.Agent, out var otherAgentId, out _);
        var (customer, policy, _) = Seed(otherAgentId);

        var response = await agent.PostAsJsonAsync("/api/claims", new
        {
            policyId = policy.Id, customerId = customer.Id, incidentType = "Collision",
            incidentDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)).ToString("yyyy-MM-dd"),
            location = "Baku", description = "Rear bumper damaged.", claimedAmount = 100m
        });

        await AssertProblem(response, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_adjuster_sees_customers_with_claims_in_reach_but_not_an_agents_book()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        _factory.ClientAs(UserRole.Adjuster, out var otherAdjusterId, out _);
        _factory.ClientAs(UserRole.Agent, out var agentId, out _);

        // An agent's customer with no claim, and one whose claim another adjuster holds.
        var book = _factory.WithDb(db => new TestData(db).Customer(fullName: "Reach Book Only", agentId: agentId));
        var (heldElsewhere, _, _) = Seed(agentId, ClaimStatus.UnderReview, otherAdjusterId, name: "Reach Held Elsewhere");
        var (queued, _, _) = Seed(agentId, name: "Reach Queued");
        var (own, _, _) = Seed(null, ClaimStatus.UnderReview, adjusterId, name: "Reach Own");

        var page = await Json(await adjuster.GetAsync("/api/customers?search=Reach%20&sortBy=fullName&sortDir=asc"));
        var ids = page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()).ToList();
        Assert.Equal([own.Id, queued.Id], ids);

        await AssertProblem(await adjuster.GetAsync($"/api/customers/{book.Id}"), HttpStatusCode.NotFound);
        await AssertProblem(await adjuster.GetAsync($"/api/customers/{heldElsewhere.Id}"), HttpStatusCode.NotFound);
        var vehicles = await Json(await adjuster.GetAsync($"/api/vehicles?customerId={book.Id}"));
        Assert.Equal(0, vehicles.GetArrayLength());
    }

    [Fact]
    public async Task An_admin_assigns_a_customer_to_an_agent_who_then_sees_them()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var agent = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (customer, _, _) = Seed();

        await AssertProblem(await agent.GetAsync($"/api/customers/{customer.Id}"), HttpStatusCode.NotFound);

        var assigned = await admin.PutAsJsonAsync($"/api/customers/{customer.Id}/agent", new { agentId });
        Assert.Equal(HttpStatusCode.NoContent, assigned.StatusCode);
        var detail = await Json(await agent.GetAsync($"/api/customers/{customer.Id}"));
        Assert.Equal(agentId, detail.GetProperty("agentId").GetGuid());
        Assert.Equal("Agent User", detail.GetProperty("agentName").GetString());

        // Only Agent accounts can hold a book.
        await AssertFieldError(
            await admin.PutAsJsonAsync($"/api/customers/{customer.Id}/agent", new { agentId = adjusterId }),
            "agentId", CustomerService.AgentNotFound);
        await AssertProblem(
            await admin.PutAsJsonAsync($"/api/customers/{Guid.NewGuid()}/agent", new { agentId }),
            HttpStatusCode.NotFound);
    }

    // ---------- Decisions ----------

    [Fact]
    public async Task Decisions_follow_the_state_machine_and_the_detail_says_why_not()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster);
        var (_, _, claim) = Seed();

        var detail = await Json(await adjuster.GetAsync($"/api/claims/{claim.Id}"));
        var actions = detail.GetProperty("actions").EnumerateArray()
            .ToDictionary(a => a.GetProperty("action").GetString()!, a => a);
        Assert.Equal(["Review", "Approve", "Reject", "Pay"], actions.Keys);
        Assert.True(actions["Review"].GetProperty("allowed").GetBoolean());
        Assert.Equal(ClaimActionBlock.StartReviewFirst, actions["Approve"].GetProperty("blockedReason").GetString());
        Assert.Equal(ClaimActionBlock.NotApproved, actions["Pay"].GetProperty("blockedReason").GetString());
        Assert.Equal("Aysel Hasanova", detail.GetProperty("customer").GetProperty("fullName").GetString());

        // Approving before review is a state conflict, not a field error.
        var early = await adjuster.PostAsJsonAsync($"/api/claims/{claim.Id}/approve", new { approvedAmount = 100m });
        await AssertProblem(early, HttpStatusCode.Conflict);

        Assert.Equal(HttpStatusCode.OK,
            (await adjuster.PostAsJsonAsync($"/api/claims/{claim.Id}/review", new { comment = (string?)null })).StatusCode);
        detail = await Json(await adjuster.GetAsync($"/api/claims/{claim.Id}"));
        actions = detail.GetProperty("actions").EnumerateArray()
            .ToDictionary(a => a.GetProperty("action").GetString()!, a => a);
        Assert.True(actions["Approve"].GetProperty("allowed").GetBoolean());
        Assert.Equal(ClaimActionBlock.AlreadyInReview, actions["Review"].GetProperty("blockedReason").GetString());
        Assert.Equal("Adjuster User", detail.GetProperty("claim").GetProperty("assignedAdjusterName").GetString());
    }

    [Fact]
    public async Task Tampered_decisions_are_rejected_on_the_right_field()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (_, _, claim) = Seed(status: ClaimStatus.UnderReview, adjusterId: adjusterId, claimed: 500m);
        var url = $"/api/claims/{claim.Id}";

        await AssertFieldError(await adjuster.PostAsJsonAsync($"{url}/reject", new { comment = "   " }),
            "comment", ClaimValidation.Messages.RejectionReasonRequired);
        await AssertFieldError(await adjuster.PostAsJsonAsync($"{url}/reject", new { comment = new string('r', 1001) }),
            "comment", ClaimValidation.Messages.CommentTooLong);
        await AssertFieldError(await adjuster.PostAsJsonAsync($"{url}/approve", new { approvedAmount = 500.01m }),
            "approvedAmount", ClaimValidation.Messages.ApprovedAmountAboveClaimed);
        await AssertFieldError(await adjuster.PostAsJsonAsync($"{url}/approve", new { approvedAmount = 10.555m }),
            "approvedAmount", ClaimValidation.Messages.ApprovedAmountPrecision);
        await AssertFieldError(await adjuster.PostAsJsonAsync($"{url}/approve", new { approvedAmount = 0m }),
            "approvedAmount", ClaimValidation.Messages.ApprovedAmountNotPositive);

        // Nothing changed.
        Assert.Equal(ClaimStatus.UnderReview, _factory.WithDb(db => db.Claims.Single(c => c.Id == claim.Id).Status));
    }

    [Fact]
    public async Task A_decision_on_a_stale_version_is_a_concurrent_update_conflict()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (_, _, claim) = Seed(status: ClaimStatus.UnderReview, adjusterId: adjusterId);
        var seen = RowVersion(claim.Id);

        // Another tab approves first, with the version both had loaded.
        var first = await adjuster.PostAsJsonAsync($"/api/claims/{claim.Id}/approve",
            new { approvedAmount = 300m, comment = "Photos match.", rowVersion = seen });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var approved = await Json(first);
        Assert.NotEqual(seen, approved.GetProperty("rowVersion").GetGuid());

        var second = await adjuster.PostAsJsonAsync($"/api/claims/{claim.Id}/reject",
            new { comment = "Not covered.", rowVersion = seen });
        await AssertProblem(second, HttpStatusCode.Conflict);
        Assert.Equal("Concurrent update", (await Json(second)).GetProperty("title").GetString());

        var stored = _factory.WithDb(db => db.Claims.Single(c => c.Id == claim.Id));
        Assert.Equal((ClaimStatus.Approved, 300m), (stored.Status, stored.ApprovedAmount));
    }

    [Fact]
    public async Task Paying_a_claim_that_is_not_approved_is_refused_before_any_payout()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (_, _, claim) = Seed(status: ClaimStatus.UnderReview, adjusterId: adjusterId);

        await AssertProblem(await adjuster.PostAsJsonAsync($"/api/claims/{claim.Id}/pay", new { }),
            HttpStatusCode.Conflict);
    }

    // ---------- CSV exports ----------

    [Fact]
    public async Task Claims_export_is_bom_utf8_csv_that_follows_the_filters_and_defuses_formulas()
    {
        var adjuster = _factory.ClientAs(UserRole.Adjuster);
        var tag = Guid.NewGuid().ToString("N")[..8];
        Seed(name: $"=HYPERLINK(\"x\") {tag}");
        Seed(name: $"Əliyev Şahin, \"Ağa\" {tag}");
        Seed(status: ClaimStatus.Withdrawn, name: $"Withdrawn {tag}");

        var response = await adjuster.GetAsync($"/api/claims/export?status=Submitted&search={tag}&sortBy=claimNumber&sortDir=asc");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("claims-", response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal([0xEF, 0xBB, 0xBF], bytes[..3]);

        var lines = Encoding.UTF8.GetString(bytes[3..]).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.StartsWith("Claim number,Status,Customer,", lines[0]);
        Assert.Equal(3, lines.Length); // header + the two Submitted ones; the withdrawn claim is filtered out
        var body = string.Join("\n", lines[1..]);
        Assert.Contains($"\"'=HYPERLINK(\"\"x\"\") {tag}\"", body);
        Assert.Contains($"\"Əliyev Şahin, \"\"Ağa\"\" {tag}\"", body);
        Assert.DoesNotContain("Withdrawn", body);
        Assert.Contains(",500.00,", body);
    }

    [Fact]
    public async Task Policies_export_holds_only_the_agents_own_sales()
    {
        var agent = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        _factory.ClientAs(UserRole.Agent, out var otherAgentId, out _);
        var (_, mine, _) = Seed(agentId, name: "+994 Mine");
        var (_, theirs, _) = Seed(otherAgentId);

        var text = Encoding.UTF8.GetString(await agent.GetByteArrayAsync("/api/policies/export"));

        Assert.Contains(mine.PolicyNumber, text);
        Assert.DoesNotContain(theirs.PolicyNumber, text);
        Assert.Contains("'+994 Mine", text);
    }

    [Fact]
    public void Csv_cells_escape_quotes_separators_and_formula_triggers()
    {
        Assert.Equal("plain", Csv.Text("plain"));
        Assert.Equal("\"a,b\"", Csv.Text("a,b"));
        Assert.Equal("\"say \"\"hi\"\"\"", Csv.Text("say \"hi\""));
        Assert.Equal("\"line\nbreak\"", Csv.Text("line\nbreak"));
        Assert.Equal("\" padded \"", Csv.Text(" padded "));
        foreach (var trigger in new[] { "=1+1", "+1", "-1", "@SUM(A1)", "\tx" })
        {
            Assert.StartsWith("'", Csv.Text(trigger).Trim('"'));
        }
        Assert.Equal("'-2+3", Csv.Text("-2+3"));
        Assert.Equal(string.Empty, Csv.Text(null));
        // Numbers are written by the server, never neutralised.
        Assert.Equal("-12.50", Csv.Number(-12.5m));
        Assert.Equal("1234.00", Csv.Number(1234m));
    }

    // ---------- Overview ----------

    [Fact]
    public async Task The_overview_has_the_blocks_of_the_callers_desks()
    {
        var adjuster = await Json(await _factory.ClientAs(UserRole.Adjuster).GetAsync("/api/staff/overview"));
        Assert.Equal(JsonValueKind.Object, adjuster.GetProperty("claims").ValueKind);
        Assert.Equal(JsonValueKind.Null, adjuster.GetProperty("sales").ValueKind);

        var agentClient = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        Seed(agentId);
        Seed(agentId, status: ClaimStatus.Rejected);
        var agent = await Json(await agentClient.GetAsync("/api/staff/overview"));
        Assert.Equal(JsonValueKind.Null, agent.GetProperty("claims").ValueKind);
        var sales = agent.GetProperty("sales");
        Assert.Equal(2, sales.GetProperty("customers").GetInt32());
        Assert.Equal(1, sales.GetProperty("openClaims").GetInt32());
        Assert.Equal(2, sales.GetProperty("recentPolicies").GetArrayLength());
        var active = sales.GetProperty("policiesByStatus").EnumerateArray()
            .Single(s => s.GetProperty("status").GetString() == "Active");
        Assert.Equal(2, active.GetProperty("count").GetInt32());
        Assert.Equal("AZN", agent.GetProperty("currency").GetString());

        var admin = await Json(await _factory.ClientAs(UserRole.Admin).GetAsync("/api/staff/overview"));
        Assert.Equal(JsonValueKind.Object, admin.GetProperty("claims").ValueKind);
        Assert.Equal(JsonValueKind.Object, admin.GetProperty("sales").ValueKind);
    }

    [Fact]
    public async Task The_adjusters_overview_counts_their_reach_and_their_decisions()
    {
        var client = _factory.ClientAs(UserRole.Adjuster, out var adjusterId, out _);
        var (_, _, mine) = Seed(status: ClaimStatus.UnderReview, adjusterId: adjusterId, name: "Decided By Me");
        await client.PostAsJsonAsync($"/api/claims/{mine.Id}/reject", new { comment = "Not covered." });

        var claims = (await Json(await client.GetAsync("/api/staff/overview"))).GetProperty("claims");

        Assert.True(claims.GetProperty("waitingForReview").GetInt32() >= 0);
        Assert.Equal(1, claims.GetProperty("decidedLast30Days").GetInt32());
        var decision = claims.GetProperty("recentDecisions")[0];
        Assert.Equal("Decided By Me", decision.GetProperty("customerName").GetString());
        Assert.Equal("Rejected", decision.GetProperty("status").GetString());
    }
}
