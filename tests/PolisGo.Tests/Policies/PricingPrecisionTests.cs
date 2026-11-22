using PolisGo.Application.Common;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Policies;

// The factors frozen at issue must explain the premium. SQL Server rounds a
// decimal column to its scale (SQLite stores decimals as text and doesn't),
// so this runs there: at four decimals, 250 x 0.8634 = 215.85 while the
// premium is 215.84.
[Trait("Category", "SqlServer")]
public class PricingPrecisionTests
{
    [SqlServerFact]
    public async Task Stored_factors_reproduce_the_premium_on_sql_server()
    {
        using var db = new SqlServerTestDb();
        var today = BusinessCalendar.Today(TimeProvider.System);
        Guid userId, customerId, vehicleId;
        using (var seed = db.NewContext())
        {
            var data = new TestData(seed);
            var user = data.User(UserRole.Client);
            // Young driver (x1.4), new licence (x1.3), 1800 cc (x1.15), no claims (x0.9).
            var customer = new Customer
            {
                Id = Guid.NewGuid(), UserId = user.Id, FullName = "Young Driver", Email = user.Email,
                Phone = "+994501234567", CreatedAt = DateTime.UtcNow,
                BirthDate = today.AddYears(-20).ToDateTime(TimeOnly.MinValue),
                DrivingLicenseDate = today.AddYears(-1).ToDateTime(TimeOnly.MinValue)
            };
            seed.Customers.Add(customer);
            seed.SaveChanges();
            (userId, customerId, vehicleId) = (user.Id, customer.Id, data.Vehicle(customer.Id).Id);
        }
        var client = new FakeCurrentUser { UserId = userId, Role = UserRole.Client, CustomerId = customerId };
        var request = new CreatePolicyRequest(vehicleId, "CASCO", today.AddDays(1), 5, null);

        var quote = await new PolicyService(db.NewContext(), new PremiumCalculator(), new StubPaymentGateway(), client)
            .QuoteAsync(request);
        var created = await new PolicyService(db.NewContext(), new PremiumCalculator(), new StubPaymentGateway(), client)
            .CreateAsync(request);
        var stored = (await new PolicyService(db.NewContext(), new PremiumCalculator(), new StubPaymentGateway(), client)
            .GetDetailAsync(created.Id)).Pricing!;

        Assert.Equal(quote.Premium, created.Premium);
        Assert.Equal(created.Premium, Math.Round(stored.BaseRate * stored.TotalFactor, 2, MidpointRounding.AwayFromZero));
        Assert.Equal(quote.TotalFactor, stored.TotalFactor, 10);
        Assert.Equal(quote.TermFactor, stored.TermFactor, 10);
    }
}
