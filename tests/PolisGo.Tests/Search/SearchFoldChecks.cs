using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;
using PolisGo.Application.Diagnostics;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Search;

// The searches of every list, run against any database, so SQLite and SQL
// Server answer the same questions (SearchFoldTests, SearchFoldSqlServerTests).
internal sealed class SearchFoldChecks(ITestDatabase database, SearchFoldDataSet data)
{
    // Every SQL command the services sent, to check what the database does.
    public SqlCapture Sql { get; } = new();

    private AppDbContext Db() => database.NewContext(Sql);

    private static FakeCurrentUser Admin() => new() { UserId = Guid.NewGuid(), Role = UserRole.Admin };

    public async Task People(string typed, string[] expected)
    {
        var admin = Admin();
        var claims = await new ClaimService(Db(), admin, new NoPayouts(), Options.Create(new ClaimOptions()))
            .ListAsync(new ListClaimsFilter(Search: typed, PageSize: 50));
        AssertTags(expected, claims.Items.Select(c => data.ClaimTags[c.Id]), claims.TotalCount, "claims");

        var policies = await new PolicyService(Db(), new PremiumCalculator(), new StubPaymentGateway(), admin)
            .ListAsync(new ListPoliciesQuery(Search: typed, PageSize: 50));
        AssertTags(expected, policies.Items.Select(p => data.PolicyTags[p.Id]), policies.TotalCount, "policies");

        var customers = await new CustomerService(Db(), admin).ListAsync(new ListCustomersQuery(Search: typed, PageSize: 50));
        AssertTags(expected, customers.Items.Select(c => data.CustomerTags[c.Id]), customers.TotalCount, "customers");

        var staff = await new StaffAdminService(Db(), admin, new BcryptPasswordHasher(), TimeProvider.System)
            .ListAsync(new ListStaffQuery(Search: typed, PageSize: 50));
        AssertTags(expected, staff.Items.Select(s => data.StaffTags[s.Id]), staff.TotalCount, "staff");
    }

    public async Task Book(string typed, string[] expected)
    {
        var agent = new FakeCurrentUser { UserId = data.BookAgentId, Role = UserRole.Agent };
        var customers = await new CustomerService(Db(), agent).ListAsync(new ListCustomersQuery(Search: typed, PageSize: 50));
        AssertTags(expected, customers.Items.Select(c => data.CustomerTags[c.Id]), customers.TotalCount, "book");

        var policies = await new PolicyService(Db(), new PremiumCalculator(), new StubPaymentGateway(), agent)
            .ListAsync(new ListPoliciesQuery(Search: typed, PageSize: 50));
        AssertTags(expected, policies.Items.Select(p => data.PolicyTags[p.Id]), policies.TotalCount, "book policies");
    }

    public async Task Errors(string typed, string[] expected)
    {
        var errors = await new ErrorTrackingService(Db(), Admin(), TimeProvider.System)
            .ListAsync(new ErrorListQuery(Search: typed, PageSize: 50));
        AssertTags(expected, errors.Items.Select(e => data.ErrorTags[e.Id]), errors.TotalCount, "errors");
    }

    // Numbers and plates are found in any case, with ı or İ typed for I.
    public async Task Codes()
    {
        var admin = Admin();
        for (var i = 0; i < SearchFoldDataSet.People.Length; i++)
        {
            var tag = SearchFoldDataSet.People[i].Tag;
            var policies = new PolicyService(Db(), new PremiumCalculator(), new StubPaymentGateway(), admin);
            foreach (var typed in new[] { SearchFoldDataSet.PolicyNumber(i).ToLowerInvariant(), Dotless(SearchFoldDataSet.Plate(i)) })
            {
                var found = await policies.ListAsync(new ListPoliciesQuery(Search: typed));
                Assert.Equal([tag], found.Items.Select(p => data.PolicyTags[p.Id]));
            }

            var claims = new ClaimService(Db(), admin, new NoPayouts(), Options.Create(new ClaimOptions()));
            foreach (var typed in new[] { SearchFoldDataSet.ClaimNumber(i).ToLowerInvariant(), SearchFoldDataSet.PolicyNumber(i).ToLowerInvariant() })
            {
                var found = await claims.ListAsync(new ListClaimsFilter(Search: typed));
                Assert.Equal([tag], found.Items.Select(c => data.ClaimTags[c.Id]));
            }
        }

        // "77-IB-000" typed as an Azerbaijani keyboard gives it.
        static string Dotless(string plate) => plate.ToLowerInvariant().Replace('i', 'ı');
    }

    private static void AssertTags(string[] expected, IEnumerable<string> found, int total, string list)
    {
        var tags = found.ToList();
        Assert.True(expected.Order().SequenceEqual(tags.Order()),
            $"{list}: expected [{string.Join(", ", expected)}], found [{string.Join(", ", tags)}]");
        Assert.Equal(expected.Length, total);
    }

    private sealed class NoPayouts : IPayoutGateway
    {
        public Task<PayoutReceipt> PayoutAsync(Guid claimId, decimal amount, string idempotencyKey, CancellationToken ct = default) =>
            throw new InvalidOperationException("Searches pay nothing.");
    }
}

internal sealed class SqlCapture : DbCommandInterceptor
{
    private readonly List<string> _commands = [];

    public IReadOnlyList<string> Commands
    {
        get { lock (_commands) return [.. _commands]; }
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Add(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        Add(command);
        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void Add(DbCommand command)
    {
        lock (_commands) _commands.Add(command.CommandText);
    }
}
