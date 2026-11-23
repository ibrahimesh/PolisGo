using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PolisGo.Application.Admin;
using PolisGo.Application.Customers;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// The admin panel's endpoints: role gates, staff management (sessions end
// on deactivation and role change), audit records and the dashboard.
public class AdminPanelEndpointTests : IClassFixture<ApiFactory>
{
    private const string Password = "Staff-Passw0rd";
    private readonly ApiFactory _factory;

    public AdminPanelEndpointTests(ApiFactory factory) => _factory = factory;

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        await response.Content.LoadIntoBufferAsync();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status, string? detail = null)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await Json(response);
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
        if (detail is not null) Assert.Equal(detail, problem.GetProperty("detail").GetString());
    }

    // Creates staff through the API (so the password is hashed for sign-in).
    private async Task<(Guid Id, string Email)> CreateStaff(HttpClient admin, string role)
    {
        var email = $"{role.ToLowerInvariant()}.{Guid.NewGuid():N}@polisgo.test";
        var response = await admin.PostAsJsonAsync("/api/users/staff",
            new { email, password = Password, fullName = $"New {role}", role });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return ((await Json(response)).GetProperty("id").GetGuid(), email);
    }

    private async Task<HttpResponseMessage> Login(string email) =>
        await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password = Password });

    private async Task<HttpClient> SignedIn(string email)
    {
        var login = await Login(email);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", (await Json(login)).GetProperty("token").GetString());
        return client;
    }

    public static TheoryData<string, string> AdminEndpoints() => new()
    {
        { "GET", "/api/admin/stats" },
        { "GET", "/api/admin/dashboard" },
        { "GET", "/api/admin/audit" },
        { "GET", "/api/users/staff" },
        { "POST", "/api/users/staff" },
        { "POST", $"/api/users/{Guid.NewGuid()}/deactivate" },
        { "POST", $"/api/users/{Guid.NewGuid()}/reactivate" },
        { "PUT", $"/api/users/{Guid.NewGuid()}/role" },
        { "PUT", $"/api/customers/{Guid.NewGuid()}/agent" },
    };

    private static HttpRequestMessage Request(string method, string url) =>
        new(new HttpMethod(method), url)
        {
            Content = method == "GET" ? null : JsonContent.Create(new { role = "Agent", agentId = (Guid?)null })
        };

    [Theory]
    [MemberData(nameof(AdminEndpoints))]
    public async Task Anonymous_gets_401(string method, string url)
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().SendAsync(Request(method, url))).StatusCode);
    }

    [Theory]
    [MemberData(nameof(AdminEndpoints))]
    public async Task Every_non_admin_role_gets_403(string method, string url)
    {
        foreach (var role in new[] { UserRole.Client, UserRole.Agent, UserRole.Adjuster })
        {
            var response = await _factory.ClientAs(role).SendAsync(Request(method, url));
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{role} {method} {url}: {response.StatusCode}");
        }
    }

    [Fact]
    public async Task Staff_creation_follows_the_registration_rules_and_allows_admins()
    {
        var admin = _factory.ClientAs(UserRole.Admin);

        var invalid = await admin.PostAsJsonAsync("/api/users/staff",
            new { email = "not-an-email", password = "weak", fullName = "A", role = "Client" });
        await AssertProblem(invalid, HttpStatusCode.BadRequest);
        var errors = (await Json(invalid)).GetProperty("errors");
        Assert.Equal(["Email", "FullName", "Password", "Role"],
            errors.EnumerateObject().Select(e => e.Name).Order().ToArray());
        Assert.Equal(AdminValidation.Messages.RoleInvalid, errors.GetProperty("Role")[0].GetString());

        var (id, email) = await CreateStaff(admin, "Admin");
        var page = await Json(await admin.GetAsync($"/api/users/staff?search={email}"));
        var row = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal(id, row.GetProperty("id").GetGuid());
        Assert.Equal("Admin", row.GetProperty("role").GetString());
        Assert.True(row.GetProperty("isActive").GetBoolean());

        await AssertProblem(await admin.PostAsJsonAsync("/api/users/staff",
            new { email, password = Password, fullName = "Again", role = "Agent" }), HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task A_deactivated_user_cannot_sign_in_and_their_open_session_ends()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var (id, email) = await CreateStaff(admin, "Adjuster");
        var session = await SignedIn(email);
        Assert.Equal(HttpStatusCode.OK, (await session.GetAsync("/api/auth/me")).StatusCode);

        var deactivated = await admin.PostAsync($"/api/users/{id}/deactivate", null);
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        Assert.False((await Json(deactivated)).GetProperty("isActive").GetBoolean());

        // The token issued before is refused at once, and sign-in too.
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/claims")).StatusCode);
        await AssertProblem(await Login(email), HttpStatusCode.Unauthorized);
        await AssertProblem(await admin.PostAsync($"/api/users/{id}/deactivate", null),
            HttpStatusCode.Conflict, AdminValidation.Messages.AlreadyInactive);

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/users/{id}/reactivate", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(email)).StatusCode);
        // The old token stays dead: deactivation rotated its stamp.
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task A_role_change_ends_sessions_and_releases_a_former_agents_customers()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var (agentId, email) = await CreateStaff(admin, "Agent");
        var customerId = _factory.WithDb(db => new TestData(db).Customer(fullName: "Book Release", agentId: agentId).Id);
        var session = await SignedIn(email);

        await AssertProblem(await admin.PutAsJsonAsync($"/api/users/{agentId}/role", new { role = "Client" }),
            HttpStatusCode.BadRequest);
        await AssertProblem(await admin.PutAsJsonAsync($"/api/users/{agentId}/role", new { role = "Agent" }),
            HttpStatusCode.Conflict, AdminValidation.Messages.SameRole);

        var changed = await admin.PutAsJsonAsync($"/api/users/{agentId}/role", new { role = "Adjuster" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal("Adjuster", (await Json(changed)).GetProperty("role").GetString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/auth/me")).StatusCode);
        var me = await Json(await (await SignedIn(email)).GetAsync("/api/auth/me"));
        Assert.Equal("Adjuster", me.GetProperty("role").GetString());
        Assert.Null(_factory.WithDb(db => db.Customers.Single(c => c.Id == customerId).AgentId));

        // Both the role change and the release are in the log.
        var feed = await Json(await admin.GetAsync("/api/admin/audit?pageSize=50"));
        var actions = feed.GetProperty("items").EnumerateArray()
            .Where(e => e.GetProperty("entityId").GetGuid() == agentId || e.GetProperty("entityId").GetGuid() == customerId)
            .Select(e => (e.GetProperty("action").GetString(), e.GetProperty("toValue").ToString()))
            .ToList();
        Assert.Contains(("RoleChanged", "Adjuster"), actions);
        Assert.Contains(("CustomerAssigned", ""), actions);
    }

    [Fact]
    public async Task Clients_are_not_staff_accounts()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        _factory.ClientAs(UserRole.Client, out var clientUserId, out _);

        await AssertProblem(await admin.PostAsync($"/api/users/{clientUserId}/deactivate", null), HttpStatusCode.NotFound);
        await AssertProblem(await admin.PutAsJsonAsync($"/api/users/{clientUserId}/role", new { role = "Agent" }),
            HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Customer_assignment_is_recorded_and_needs_an_active_agent()
    {
        var admin = _factory.ClientAs(UserRole.Admin, out var adminId, out _);
        var (agentId, _) = await CreateStaff(admin, "Agent");
        var (inactiveId, _) = await CreateStaff(admin, "Agent");
        await admin.PostAsync($"/api/users/{inactiveId}/deactivate", null);
        var customerId = _factory.WithDb(db => new TestData(db).Customer(fullName: "Assign Recorded").Id);

        await AssertProblem(await admin.PutAsJsonAsync($"/api/customers/{customerId}/agent", new { agentId = inactiveId }),
            HttpStatusCode.BadRequest);
        Assert.Equal(HttpStatusCode.NoContent,
            (await admin.PutAsJsonAsync($"/api/customers/{customerId}/agent", new { agentId })).StatusCode);

        var list = await Json(await admin.GetAsync($"/api/customers?agentId={agentId}"));
        var row = Assert.Single(list.GetProperty("items").EnumerateArray());
        Assert.Equal("New Agent", row.GetProperty("agentName").GetString());
        var unassigned = await Json(await admin.GetAsync("/api/customers?unassigned=true&search=Assign%20Recorded"));
        Assert.Equal(0, unassigned.GetProperty("totalCount").GetInt32());

        var feed = await Json(await admin.GetAsync($"/api/admin/audit?entityType=Customer&actorId={adminId}"));
        var entry = Assert.Single(feed.GetProperty("items").EnumerateArray());
        Assert.Equal("Assign Recorded", entry.GetProperty("entityLabel").GetString());
        Assert.Equal("New Agent", entry.GetProperty("toValue").GetString());
    }

    [Fact]
    public async Task The_audit_feed_merges_status_history_and_filters_by_type_actor_and_date()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var adjusterId = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var adjuster = data.User(UserRole.Adjuster);
            var customer = data.Customer();
            var policy = data.Policy(customer, data.Vehicle(customer.Id));
            data.Claim(policy, ClaimStatus.UnderReview, adjusterId: adjuster.Id,
                history: (ClaimStatus.UnderReview, new DateTime(2025, 3, 10, 9, 0, 0, DateTimeKind.Utc), adjuster.Id));
            return adjuster.Id;
        });

        var mine = await Json(await admin.GetAsync($"/api/admin/audit?actorId={adjusterId}"));
        var row = Assert.Single(mine.GetProperty("items").EnumerateArray());
        Assert.Equal("Claim", row.GetProperty("entityType").GetString());
        Assert.Equal("StatusChanged", row.GetProperty("action").GetString());
        Assert.Equal(("Submitted", "UnderReview"),
            (row.GetProperty("fromValue").GetString(), row.GetProperty("toValue").GetString()));

        var inRange = await Json(await admin.GetAsync($"/api/admin/audit?actorId={adjusterId}&from=2025-03-10&to=2025-03-10"));
        Assert.Equal(1, inRange.GetProperty("totalCount").GetInt32());
        var outside = await Json(await admin.GetAsync($"/api/admin/audit?actorId={adjusterId}&from=2025-03-11"));
        Assert.Equal(0, outside.GetProperty("totalCount").GetInt32());
        var policiesOnly = await Json(await admin.GetAsync($"/api/admin/audit?actorId={adjusterId}&entityType=Policy"));
        Assert.Equal(0, policiesOnly.GetProperty("totalCount").GetInt32());

        await AssertProblem(await admin.GetAsync("/api/admin/audit?from=2025-03-11&to=2025-03-10"), HttpStatusCode.BadRequest);
    }

    // Typing an email in the audit search used to list every event: the API
    // had no search. It now narrows by actor email and name, claim number
    // and status code, and the SPA's translated codes.
    [Fact]
    public async Task The_audit_search_narrows_by_email_name_number_and_action()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var unique = Guid.NewGuid().ToString("N")[..8];
        var email = $"audit.search.{unique}@polisgo.test";
        var (claimNumber, adjusterId) = _factory.WithDb(db =>
        {
            var data = new TestData(db);
            var adjuster = data.User(UserRole.Adjuster, email: email);
            adjuster.FullName = $"Zəhra Findable{unique}";
            db.SaveChanges();
            var other = data.User(UserRole.Adjuster);
            var customer = data.Customer();
            var policy = data.Policy(customer, data.Vehicle(customer.Id));
            var claim = data.Claim(policy, ClaimStatus.Approved, adjusterId: adjuster.Id,
                history:
                [
                    (ClaimStatus.UnderReview, new DateTime(2025, 4, 1, 9, 0, 0, DateTimeKind.Utc), adjuster.Id),
                    (ClaimStatus.Approved, new DateTime(2025, 4, 2, 9, 0, 0, DateTimeKind.Utc), adjuster.Id)
                ]);
            data.Claim(policy, ClaimStatus.UnderReview, adjusterId: other.Id,
                history: (ClaimStatus.UnderReview, new DateTime(2025, 4, 1, 9, 0, 0, DateTimeKind.Utc), other.Id));
            return (claim.ClaimNumber, adjuster.Id);
        });

        async Task<int> Total(string query) =>
            (await Json(await admin.GetAsync($"/api/admin/audit?{query}"))).GetProperty("totalCount").GetInt32();

        Assert.Equal(2, await Total($"search={Uri.EscapeDataString(email.ToUpperInvariant())}"));
        Assert.Equal(2, await Total($"search=findable{unique}"));
        Assert.Equal(2, await Total($"search={claimNumber}"));
        Assert.Equal(1, await Total($"search=findable{unique}&entityType=Claim&from=2025-04-02"));
        // Status code by name, and codes the SPA sends from RU/AZ labels.
        Assert.Equal(1, await Total($"actorId={adjusterId}&search=approved"));
        Assert.Equal(1, await Total($"actorId={adjusterId}&actions=Approved"));
        Assert.Equal(2, await Total($"actorId={adjusterId}&actions=Approved&actions=UnderReview&actions=Bogus"));
        Assert.Equal(0, await Total($"search=no-such-person-{unique}"));

        var page = await Json(await admin.GetAsync($"/api/admin/audit?search={Uri.EscapeDataString(email)}"));
        Assert.All(page.GetProperty("items").EnumerateArray(),
            e => Assert.Equal(claimNumber, e.GetProperty("entityLabel").GetString()));

        var tooLong = await admin.GetAsync($"/api/admin/audit?search={new string('x', 101)}");
        await AssertProblem(tooLong, HttpStatusCode.BadRequest, null);
        Assert.True((await Json(tooLong)).GetProperty("errors").TryGetProperty("search", out _));
    }

    // Dates at the ends of the calendar broke the date arithmetic (a 500);
    // they are a field error now.
    [Theory]
    [InlineData("/api/admin/dashboard?to=9999-12-31", "to")]
    [InlineData("/api/admin/dashboard?to=0001-01-15", "to")]
    [InlineData("/api/admin/dashboard?from=0001-01-01&to=0001-06-01", "from")]
    [InlineData("/api/admin/audit?to=9999-12-31", "to")]
    [InlineData("/api/admin/audit?from=0001-01-01", "from")]
    public async Task Dates_outside_2000_to_2100_are_a_400(string url, string field)
    {
        var admin = _factory.ClientAs(UserRole.Admin);

        var response = await admin.GetAsync(url);

        await AssertProblem(response, HttpStatusCode.BadRequest);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(AdminValidation.Messages.DateOutOfRange, problem.GetProperty("errors").GetProperty(field)[0].GetString());
    }

    [Fact]
    public async Task The_dashboard_covers_a_range_and_rejects_bad_ones()
    {
        var admin = _factory.ClientAs(UserRole.Admin);
        var response = await admin.GetAsync("/api/admin/dashboard?from=2026-01-01&to=2026-03-31");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await Json(response);
        Assert.Equal(3, body.GetProperty("monthly").GetArrayLength());
        Assert.Equal(6, body.GetProperty("claimsByStatus").GetArrayLength());
        Assert.Equal("AZN", body.GetProperty("currency").GetString());

        var defaults = await Json(await admin.GetAsync("/api/admin/dashboard"));
        Assert.Equal(12, defaults.GetProperty("monthly").GetArrayLength());

        await AssertProblem(await admin.GetAsync("/api/admin/dashboard?from=2026-03-01&to=2026-01-01"), HttpStatusCode.BadRequest);
        await AssertProblem(await admin.GetAsync("/api/admin/dashboard?from=2022-01-01&to=2026-01-01"), HttpStatusCode.BadRequest);
    }

    [Fact]
    public void Agent_not_found_message_is_the_shared_constant() =>
        Assert.Equal("No active agent with this id.", CustomerService.AgentNotFound);
}

// Its own database: here the signed-in admin is the only one.
public class LastAdminEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public LastAdminEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task The_last_active_admin_is_kept_and_nobody_acts_on_themselves()
    {
        var admin = _factory.ClientAs(UserRole.Admin, out var adminId, out _);

        async Task Expect(HttpResponseMessage response, string detail)
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(detail, problem.RootElement.GetProperty("detail").GetString());
        }

        await Expect(await admin.PostAsync($"/api/users/{adminId}/deactivate", null), AdminValidation.Messages.LastAdmin);
        await Expect(await admin.PutAsJsonAsync($"/api/users/{adminId}/role", new { role = "Agent" }),
            AdminValidation.Messages.LastAdmin);

        // With a second admin, the rule that answers is "not yourself".
        var second = await admin.PostAsJsonAsync("/api/users/staff",
            new { email = $"admin.{Guid.NewGuid():N}@polisgo.test", password = "Staff-Passw0rd", fullName = "Second Admin", role = "Admin" });
        using var created = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        var secondId = created.RootElement.GetProperty("id").GetGuid();
        await Expect(await admin.PostAsync($"/api/users/{adminId}/deactivate", null), AdminValidation.Messages.NotYourself);

        // The other admin can go; then this one is the last again.
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/users/{secondId}/role", new { role = "Agent" })).StatusCode);
        await Expect(await admin.PutAsJsonAsync($"/api/users/{adminId}/role", new { role = "Adjuster" }),
            AdminValidation.Messages.LastAdmin);
        Assert.True(_factory.WithDb(db => db.Users.Single(u => u.Id == adminId).IsActive));
    }
}
