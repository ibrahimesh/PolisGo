using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Customers;

public class CustomerServiceTests : IDisposable
{
    private readonly SqliteTestDb _testDb = new();
    private readonly TestData _data;

    public CustomerServiceTests() => _data = new TestData(_testDb.Db);

    public void Dispose() => _testDb.Dispose();

    private CustomerService Sut(ICurrentUser user) => new(_testDb.NewContext(), user);

    private static FakeCurrentUser Admin() => new() { UserId = Guid.NewGuid(), Role = UserRole.Admin };

    private static FakeCurrentUser Staff(User user) => new() { UserId = user.Id, Role = user.Role };

    // ---------- List: paging, search, sort ----------

    [Fact]
    public async Task List_caps_page_size_at_50_and_reports_total()
    {
        for (var i = 0; i < 55; i++) _data.Customer(fullName: $"Customer {i:00}");

        var page = await Sut(Admin()).ListAsync(new ListCustomersQuery(PageSize: 500));

        Assert.Equal(50, page.PageSize);
        Assert.Equal(50, page.Items.Count);
        Assert.Equal(55, page.TotalCount);

        var second = await Sut(Admin()).ListAsync(new ListCustomersQuery(Page: 2, PageSize: 50));
        Assert.Equal(5, second.Items.Count);
        Assert.Empty(page.Items.Select(c => c.Id).Intersect(second.Items.Select(c => c.Id)));
    }

    [Theory]
    [InlineData("hasanova")]          // name, case-insensitive
    [InlineData("AYSEL.H@")]          // email fragment, case-insensitive
    [InlineData("+994 50 123")]       // phone as typed
    [InlineData("501234567")]         // phone digits only
    [InlineData("50-123-45")]         // phone in another format
    public async Task List_search_matches_name_email_or_phone(string search)
    {
        var match = _data.Customer("Aysel Hasanova", "aysel.h@mail.az", "+994 50 123 45 67");
        _data.Customer("Rauf Aliyev", "rauf@mail.az", "+994 55 765 43 21");

        var result = await Sut(Admin()).ListAsync(new ListCustomersQuery(Search: search));

        Assert.Equal(match.Id, Assert.Single(result.Items).Id);
        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task List_search_treats_wildcards_literally()
    {
        _data.Customer("Plain Name", "plain@mail.az");
        var literal = _data.Customer("Percent 100% Name", "pct@mail.az");

        Assert.Equal(literal.Id, Assert.Single((await Sut(Admin()).ListAsync(new ListCustomersQuery(Search: "100%"))).Items).Id);
        Assert.Empty((await Sut(Admin()).ListAsync(new ListCustomersQuery(Search: "_lain"))).Items);
    }

    [Fact]
    public async Task List_rejects_overlong_search()
    {
        var query = new ListCustomersQuery(Search: new string('a', CustomerService.MaxSearchLength + 1));
        var ex = await Assert.ThrowsAsync<ValidationException>(() => Sut(Admin()).ListAsync(query));
        Assert.Contains("search", ex.Errors.Keys);
    }

    [Fact]
    public async Task List_sorts_by_requested_field_and_defaults_to_newest_first()
    {
        var t = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var b = _data.Customer("Bahruz", "c@mail.az", createdAt: t.AddDays(1));
        var a = _data.Customer("Anar", "b@mail.az", createdAt: t.AddDays(2));
        var c = _data.Customer("Cavid", "a@mail.az", createdAt: t);

        async Task<Guid[]> Order(ListCustomersQuery q) =>
            (await Sut(Admin()).ListAsync(q)).Items.Select(i => i.Id).ToArray();

        Assert.Equal(new[] { a.Id, b.Id, c.Id }, await Order(new ListCustomersQuery()));
        Assert.Equal(new[] { a.Id, b.Id, c.Id }, await Order(new ListCustomersQuery(SortBy: CustomerSortBy.FullName, SortDirection: SortDirection.Asc)));
        Assert.Equal(new[] { c.Id, b.Id, a.Id }, await Order(new ListCustomersQuery(SortBy: CustomerSortBy.FullName, SortDirection: SortDirection.Desc)));
        Assert.Equal(new[] { c.Id, a.Id, b.Id }, await Order(new ListCustomersQuery(SortBy: CustomerSortBy.Email, SortDirection: SortDirection.Asc)));
        Assert.Equal(new[] { c.Id, b.Id, a.Id }, await Order(new ListCustomersQuery(SortBy: CustomerSortBy.CreatedAt, SortDirection: SortDirection.Asc)));
    }

    // ---------- List: counts respect role visibility ----------

    [Fact]
    public async Task List_counts_follow_each_roles_visibility()
    {
        var agent = _data.User(UserRole.Agent);
        var otherAgent = _data.User(UserRole.Agent);
        var adjuster = _data.User(UserRole.Adjuster);
        var otherAdjuster = _data.User(UserRole.Adjuster);

        // Assigned to agent; otherAgent sold one policy before that.
        var customer = _data.Customer(userId: _data.User(UserRole.Client).Id, agentId: agent.Id);
        var vehicle = _data.Vehicle(customer.Id);
        _data.Vehicle(customer.Id);
        var mine = _data.Policy(customer, vehicle, PolicyStatus.Active, agentId: agent.Id);
        _data.Policy(customer, vehicle, PolicyStatus.Draft, agentId: agent.Id);
        var theirs = _data.Policy(customer, vehicle, PolicyStatus.Active, agentId: otherAgent.Id);
        _data.Claim(mine);                                               // unassigned
        _data.Claim(theirs, ClaimStatus.UnderReview, adjusterId: adjuster.Id);
        _data.Claim(theirs, ClaimStatus.UnderReview, adjusterId: otherAdjuster.Id);

        async Task<CustomerListItem> RowFor(ICurrentUser user) =>
            Assert.Single((await Sut(user).ListAsync(new ListCustomersQuery())).Items);

        var asAdmin = await RowFor(Admin());
        Assert.Equal((2, 3, 2, 3), (asAdmin.VehicleCount, asAdmin.PolicyCount, asAdmin.ActivePolicyCount, asAdmin.ClaimCount));
        Assert.True(asAdmin.HasAccount);

        var asAgent = await RowFor(Staff(agent));
        Assert.Equal((2, 2, 1, 1), (asAgent.VehicleCount, asAgent.PolicyCount, asAgent.ActivePolicyCount, asAgent.ClaimCount));

        var asAdjuster = await RowFor(Staff(adjuster));
        Assert.Equal((3, 2), (asAdjuster.PolicyCount, asAdjuster.ClaimCount)); // unassigned + own
    }

    // ---------- Detail ----------

    [Fact]
    public async Task Detail_returns_profile_vehicles_policies_and_claims_summary()
    {
        var customer = _data.Customer("Leyla Mammadova", "leyla@mail.az");
        var vehicle = _data.Vehicle(customer.Id);
        var older = _data.Policy(customer, vehicle, createdAt: DateTime.UtcNow.AddDays(-30), premium: 55m);
        var newer = _data.Policy(customer, vehicle, createdAt: DateTime.UtcNow.AddDays(-1), cascoType: true);
        _data.Claim(older, ClaimStatus.Paid, claimed: 400m, approved: 300m);
        _data.Claim(older, ClaimStatus.Rejected, claimed: 100m);
        _data.Claim(newer, ClaimStatus.Submitted, claimed: 250m);
        // Another customer's data must not leak in.
        var other = _data.Customer();
        _data.Claim(_data.Policy(other, _data.Vehicle(other.Id)), ClaimStatus.Paid, claimed: 9999m, approved: 9999m);

        var detail = await Sut(Admin()).GetByIdAsync(customer.Id);

        Assert.Equal("Leyla Mammadova", detail.FullName);
        Assert.Equal(new DateOnly(1990, 5, 1), detail.BirthDate);
        Assert.False(detail.HasAccount);
        Assert.Equal(vehicle.Id, Assert.Single(detail.Vehicles).Id);
        Assert.Equal(new[] { newer.Id, older.Id }, detail.Policies.Select(p => p.Id));
        Assert.Equal(new[] { "CASCO", "MTPL" }, detail.Policies.Select(p => p.PolicyTypeCode));
        Assert.Equal(55m, detail.Policies[1].Premium);

        Assert.Equal(3, detail.Claims.Total);
        Assert.Equal(Enum.GetValues<ClaimStatus>(), detail.Claims.ByStatus.Select(s => s.Status));
        Assert.Equal(1, detail.Claims.ByStatus.Single(s => s.Status == ClaimStatus.Paid).Count);
        Assert.Equal(0, detail.Claims.ByStatus.Single(s => s.Status == ClaimStatus.Approved).Count);
        Assert.Equal(750m, detail.Claims.ClaimedAmount);
        Assert.Equal(300m, detail.Claims.PaidAmount);
        Assert.Equal(3, detail.Claims.Recent.Count);
        Assert.All(detail.Claims.Recent, c => Assert.False(string.IsNullOrEmpty(c.PolicyNumber)));
    }

    [Fact]
    public async Task Detail_limits_recent_claims_newest_first()
    {
        var customer = _data.Customer();
        var policy = _data.Policy(customer, _data.Vehicle(customer.Id));
        var t = DateTime.UtcNow.AddDays(-20);
        var claims = Enumerable.Range(0, CustomerService.RecentClaimsLimit + 2)
            .Select(i => _data.Claim(policy, createdAt: t.AddDays(i)))
            .ToList();

        var detail = await Sut(Admin()).GetByIdAsync(customer.Id);

        Assert.Equal(CustomerService.RecentClaimsLimit + 2, detail.Claims.Total);
        Assert.Equal(CustomerService.RecentClaimsLimit, detail.Claims.Recent.Count);
        Assert.Equal(claims[^1].Id, detail.Claims.Recent[0].Id);
    }

    [Fact]
    public async Task Detail_for_an_agent_shows_only_their_policies_and_claims()
    {
        var agent = _data.User(UserRole.Agent);
        var customer = _data.Customer(agentId: agent.Id);
        var vehicle = _data.Vehicle(customer.Id);
        var mine = _data.Policy(customer, vehicle, agentId: agent.Id);
        var theirs = _data.Policy(customer, vehicle, agentId: _data.User(UserRole.Agent).Id);
        _data.Claim(mine);
        _data.Claim(theirs);

        var detail = await Sut(Staff(agent)).GetByIdAsync(customer.Id);

        Assert.Equal(mine.Id, Assert.Single(detail.Policies).Id);
        Assert.Equal(1, detail.Claims.Total);
        Assert.Single(detail.Vehicles); // the customer is theirs, so all of the customer's vehicles
    }

    [Fact]
    public async Task Detail_of_unknown_customer_throws_not_found()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => Sut(Admin()).GetByIdAsync(Guid.NewGuid()));
    }
}
