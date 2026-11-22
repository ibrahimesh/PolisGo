using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using PolisGo.Application.Admin;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Common;

// A page far past the end is an empty page. (page - 1) * pageSize used to
// overflow into a negative OFFSET, which SQL Server rejects with a 500 and
// SQLite silently accepts, so this runs on SQL Server.
[Trait("Category", "SqlServer")]
public class PagingTests
{
    [SqlServerFact]
    public async Task The_last_possible_page_is_empty_on_sql_server()
    {
        using var db = new SqlServerTestDb();
        Guid adminId;
        using (var seed = db.NewContext())
        {
            var data = new TestData(seed);
            adminId = data.User(UserRole.Admin).Id;
            var customer = data.Customer();
            data.Claim(data.Policy(customer, data.Vehicle(customer.Id)));
        }
        var admin = new FakeCurrentUser { UserId = adminId, Role = UserRole.Admin };

        Assert.Empty((await new ClaimService(db.NewContext(), admin, new NoPayouts(), Options.Create(new ClaimOptions()))
            .ListAsync(new ListClaimsFilter(Page: int.MaxValue))).Items);
        Assert.Empty((await new PolicyService(db.NewContext(), new PremiumCalculator(), new StubPaymentGateway(), admin)
            .ListAsync(new ListPoliciesQuery(Page: int.MaxValue))).Items);
        Assert.Empty((await new CustomerService(db.NewContext(), admin)
            .ListAsync(new ListCustomersQuery(Page: int.MaxValue))).Items);
        Assert.Empty((await new StaffAdminService(db.NewContext(), admin, new BcryptPasswordHasher(), TimeProvider.System)
            .ListAsync(new ListStaffQuery(Page: int.MaxValue))).Items);
    }

    private sealed class NoPayouts : PolisGo.Application.Abstractions.IPayoutGateway
    {
        public Task<PolisGo.Application.Abstractions.PayoutReceipt> PayoutAsync(
            Guid claimId, decimal amount, string idempotencyKey, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("not used");
    }
}
