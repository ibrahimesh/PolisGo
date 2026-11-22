using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Infrastructure.Persistence.Configurations;

namespace PolisGo.Tests.Infrastructure;

// Minimal, valid rows for read-side tests (stats, customer directory). Each
// helper saves immediately and returns the entity, so tests stay linear.
internal sealed class TestData
{
    private readonly AppDbContext _db;
    // Static: several TestData instances often share one database (ApiFactory).
    private static int _sequence;

    public TestData(AppDbContext db) => _db = db;

    private static int Next() => Interlocked.Increment(ref _sequence);

    public User User(UserRole role = UserRole.Admin, string? email = null)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email ?? $"user{Next()}-{Guid.NewGuid():N}@polisgo.test",
            PasswordHash = "n/a",
            FullName = $"{role} User",
            Role = role,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        _db.SaveChanges();
        return user;
    }

    public Customer Customer(
        string fullName = "Aysel Hasanova",
        string? email = null,
        string phone = "+994 50 123 45 67",
        DateTime? createdAt = null,
        Guid? userId = null,
        Guid? agentId = null)
    {
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            AgentId = agentId,
            FullName = fullName,
            Email = email ?? $"customer{Next()}@polisgo.test",
            Phone = phone,
            BirthDate = new DateTime(1990, 5, 1),
            DrivingLicenseDate = new DateTime(2010, 6, 1),
            CreatedAt = createdAt ?? DateTime.UtcNow
        };
        _db.Customers.Add(customer);
        _db.SaveChanges();
        return customer;
    }

    public Vehicle Vehicle(Guid customerId)
    {
        var n = Next();
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            Make = "Toyota",
            Model = "Corolla",
            Year = 2019,
            EngineCapacityCc = 1800,
            PlateNumber = $"10-AA-{n:000}",
            Vin = $"VIN{n:00000000000000}"
        };
        _db.Vehicles.Add(vehicle);
        _db.SaveChanges();
        return vehicle;
    }

    public Policy Policy(
        Customer customer,
        Vehicle vehicle,
        PolicyStatus status = PolicyStatus.Active,
        DateTime? createdAt = null,
        decimal premium = 100m,
        Guid? agentId = null,
        bool cascoType = false,
        DateTime? startDate = null)
    {
        var created = createdAt ?? DateTime.UtcNow;
        var start = (startDate ?? created).Date;
        var policy = new Policy
        {
            Id = Guid.NewGuid(),
            PolicyNumber = $"POL-T-{Next():000000}",
            CustomerId = customer.Id,
            VehicleId = vehicle.Id,
            PolicyTypeId = cascoType ? PolicyTypeConfiguration.CascoId : PolicyTypeConfiguration.MtplId,
            AgentId = agentId,
            StartDate = start,
            EndDate = start.AddYears(1).AddDays(-1),
            Premium = premium,
            Status = status,
            CreatedAt = created
        };
        _db.Policies.Add(policy);
        _db.SaveChanges();
        return policy;
    }

    public Payment Payment(Policy policy, decimal amount, PaymentStatus status = PaymentStatus.Completed)
    {
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            PolicyId = policy.Id,
            Amount = amount,
            PaidAt = DateTime.UtcNow,
            Method = PaymentMethod.Online,
            Status = status
        };
        _db.Payments.Add(payment);
        _db.SaveChanges();
        return payment;
    }

    // History rows are written directly so tests control timestamps exactly.
    public Claim Claim(
        Policy policy,
        ClaimStatus status = ClaimStatus.Submitted,
        DateTime? createdAt = null,
        decimal claimed = 500m,
        decimal? approved = null,
        Guid? adjusterId = null,
        params (ClaimStatus To, DateTime At, Guid By)[] history)
    {
        var claim = new Claim
        {
            Id = Guid.NewGuid(),
            ClaimNumber = $"CLM-T-{Next():000000}",
            PolicyId = policy.Id,
            IncidentDate = (createdAt ?? DateTime.UtcNow).AddDays(-1),
            Description = "Rear bumper damaged in a parking lot.",
            ClaimedAmount = claimed,
            ApprovedAmount = approved,
            Status = status,
            AssignedAdjusterId = adjusterId,
            CreatedAt = createdAt ?? DateTime.UtcNow
        };
        ClaimStatus? from = ClaimStatus.Submitted;
        foreach (var (to, at, by) in history)
        {
            claim.StatusHistory.Add(new ClaimStatusHistory
            {
                FromStatus = from,
                ToStatus = to,
                ChangedByUserId = by,
                Comment = string.Empty,
                ChangedAt = at
            });
            from = to;
        }
        _db.Claims.Add(claim);
        _db.SaveChanges();
        return claim;
    }
}

// Settable clock for time-windowed logic.
internal sealed class FakeClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;
    public override DateTimeOffset GetUtcNow() => Now;
}
