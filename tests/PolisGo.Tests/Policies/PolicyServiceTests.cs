using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;
using Xunit;

namespace PolisGo.Tests.Policies;

public class PolicyServiceTests
{
    // Reasonable default future start so validation never trips in setup.
    // Business dates are Baku dates; cover starts tomorrow at the earliest.
    private static DateOnly Today => BusinessCalendar.Today(TimeProvider.System);
    private static DateOnly Tomorrow => Today.AddDays(1);

    private static Guid SeedCustomer(
        AppDbContext db,
        string email = "client@example.com",
        int birthYearsAgo = 36,
        int licenseYearsAgo = 15)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = "n/a",
            FullName = "Test Client",
            Role = UserRole.Client,
            CreatedAt = DateTime.UtcNow
        };
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FullName = user.FullName,
            Email = email,
            Phone = "+994501111111",
            BirthDate = DateTime.UtcNow.AddYears(-birthYearsAgo).Date,
            DrivingLicenseDate = DateTime.UtcNow.AddYears(-licenseYearsAgo).Date,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        db.Customers.Add(customer);
        db.SaveChanges();
        return customer.Id;
    }

    private static Guid SeedVehicle(
        AppDbContext db,
        Guid customerId,
        string plate = "ABC-001",
        int year = 2020,
        int engineCc = 1800)
    {
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            Make = "Toyota",
            Model = "Corolla",
            Year = year,
            EngineCapacityCc = engineCc,
            PlateNumber = plate,
            Vin = $"VIN{Guid.NewGuid():N}"[..17]
        };
        db.Vehicles.Add(vehicle);
        db.SaveChanges();
        return vehicle.Id;
    }

    private static PolicyService NewSut(
        AppDbContext db,
        ICurrentUser currentUser,
        IPaymentGateway? gateway = null,
        TimeProvider? clock = null)
    {
        return new PolicyService(
            db,
            new PremiumCalculator(),
            gateway ?? new StubPaymentGateway(),
            currentUser,
            clock);
    }

    private static FakeCurrentUser Client(Guid userId, Guid customerId) => new()
    {
        UserId = userId,
        Role = UserRole.Client,
        CustomerId = customerId
    };

    private static FakeCurrentUser Agent(Guid userId) => new()
    {
        UserId = userId,
        Role = UserRole.Agent
    };

    private static FakeCurrentUser Admin(Guid userId) => new()
    {
        UserId = userId,
        Role = UserRole.Admin
    };

    // ---------- Server-side premium is final ----------

    [Fact]
    public async Task Create_RequestDtoHasNoPremiumField_PremiumAlwaysComesFromCalculator()
    {
        // The CreatePolicyRequest contract itself has no Premium property, so
        // this test also encodes that at the type level — the only way to set
        // a Premium is through the calculator.
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        var response = await sut.CreateAsync(new CreatePolicyRequest(
            VehicleId: vehicleId,
            PolicyTypeCode: "MTPL",
            StartDate: Tomorrow,
            TermMonths: 12,
            CustomerId: null));

        var expected = new PremiumCalculator().Calculate(new PremiumCalculationInput(
            "MTPL", 50.00m, 1800,
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-36).Date),
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-15).Date),
            2020, 0, 12, Today));
        Assert.Equal(expected.Premium, response.Premium);
        Assert.StartsWith("PG-", response.PolicyNumber);
    }

    // ---------- Business dates (Asia/Baku) and the start rule ----------

    // 21:30 UTC on 1 March is 01:30 on 2 March in Baku (UTC+4, no DST).
    private static FakeClock BakuAfterMidnight() => new(new DateTimeOffset(2026, 3, 1, 21, 30, 0, TimeSpan.Zero));

    [Fact]
    public async Task Cover_starts_tomorrow_in_Baku_at_the_earliest()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var sut = NewSut(fixture.Db, Client(fixture.Db.Users.First().Id, customerId), clock: BakuAfterMidnight());

        // 2 March is today in Baku, although UTC still says 1 March.
        var today = await Assert.ThrowsAsync<ValidationException>(() =>
            sut.QuoteAsync(new CreatePolicyRequest(vehicleId, "MTPL", new DateOnly(2026, 3, 2), 12, null)));
        Assert.True(today.Errors.ContainsKey("StartDate"));

        var tomorrow = await sut.QuoteAsync(new CreatePolicyRequest(vehicleId, "MTPL", new DateOnly(2026, 3, 3), 12, null));
        Assert.True(tomorrow.Premium > 0);
    }

    // Cover bought on the day it starts would pay for that morning's accident.
    [Fact]
    public async Task A_draft_whose_start_date_has_come_can_no_longer_be_paid()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var clock = new FakeClock(new DateTimeOffset(2026, 3, 5, 10, 0, 0, TimeSpan.Zero));
        var client = Client(fixture.Db.Users.First().Id, customerId);
        var draft = await NewSut(fixture.Db, client, clock: clock)
            .CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", new DateOnly(2026, 3, 6), 12, null));

        clock.Now = clock.Now.AddDays(1); // 6 March: the start date is today

        await Assert.ThrowsAsync<ConflictException>(() => NewSut(fixture.Db, client, clock: clock).PayAsync(draft.Id));
    }

    // ---------- Ownership: 404 instead of 403 ----------

    [Fact]
    public async Task GetById_ClientReadsAnotherClientsPolicy_ThrowsNotFound()
    {
        using var fixture = new SqliteTestDb();
        var aliceCustomerId = SeedCustomer(fixture.Db, "alice@example.com");
        var bobCustomerId = SeedCustomer(fixture.Db, "bob@example.com");
        var bobVehicleId = SeedVehicle(fixture.Db, bobCustomerId, plate: "BOB-001");
        var bobUserId = fixture.Db.Customers.First(c => c.Id == bobCustomerId).UserId!.Value;
        var aliceUserId = fixture.Db.Customers.First(c => c.Id == aliceCustomerId).UserId!.Value;

        var bobsService = NewSut(fixture.Db, Client(bobUserId, bobCustomerId));
        var bobsPolicy = await bobsService.CreateAsync(new CreatePolicyRequest(
            bobVehicleId, "MTPL", Tomorrow, 12, null));

        var alicesService = NewSut(fixture.Db, Client(aliceUserId, aliceCustomerId));
        await Assert.ThrowsAsync<NotFoundException>(
            () => alicesService.GetByIdAsync(bobsPolicy.Id));
    }

    [Fact]
    public async Task Create_ClientSuppliesAnotherCustomersId_IsIgnoredAndUsesTokenIdentity()
    {
        using var fixture = new SqliteTestDb();
        var aliceCustomerId = SeedCustomer(fixture.Db, "alice@example.com");
        var bobCustomerId = SeedCustomer(fixture.Db, "bob@example.com");
        // Alice owns her own vehicle; supplying Bob's CustomerId in the body
        // must not let Alice touch Bob's resources — and since Alice doesn't
        // have a vehicle under Bob's customer, we end up with NotFound.
        var alicesVehicleId = SeedVehicle(fixture.Db, aliceCustomerId, plate: "ALI-001");
        var aliceUserId = fixture.Db.Customers.First(c => c.Id == aliceCustomerId).UserId!.Value;

        var sut = NewSut(fixture.Db, Client(aliceUserId, aliceCustomerId));

        // Alice's token says she's aliceCustomerId; a malicious CustomerId in
        // the body is stripped and the policy still links to Alice.
        var response = await sut.CreateAsync(new CreatePolicyRequest(
            alicesVehicleId, "MTPL", Tomorrow, 12, CustomerId: bobCustomerId));

        Assert.Equal(aliceCustomerId, response.CustomerId);
    }

    // ---------- Overlap rule ----------

    [Fact]
    public async Task Create_OverlappingSameTypePolicy_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));

        await Assert.ThrowsAsync<ConflictException>(() =>
            sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow.AddDays(30), 12, null)));
    }

    [Fact]
    public async Task Create_NonOverlapping_Succeeds()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        // First policy: 1 month long, starting today.
        await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 1, null));

        // Second starts the day after the first ends — no overlap.
        var secondStart = Tomorrow.AddMonths(1);
        var response = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", secondStart, 6, null));

        Assert.Equal(PolicyStatus.Draft, response.Status);
    }

    [Fact]
    public async Task Create_DifferentType_OverlapAllowed()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));

        // Same vehicle + overlapping dates but different product = allowed.
        var casco = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "CASCO", Tomorrow, 12, null));
        Assert.Equal("CASCO", casco.PolicyTypeCode);
    }

    // ---------- Pay flow ----------

    [Fact]
    public async Task Pay_ActivatesPolicyAndCreatesOnePayment()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var gateway = new StubPaymentGateway();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId), gateway);

        var draft = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));

        var receipt = await sut.PayAsync(draft.Id);

        Assert.Equal(PolicyStatus.Active, receipt.Policy.Status);
        Assert.Equal(draft.Premium, receipt.Amount);
        Assert.Single(fixture.Db.Payments, p => p.PolicyId == draft.Id);
        Assert.Equal(1, gateway.CallCount);
        Assert.Equal(draft.Premium, gateway.LastAmount);
    }

    [Fact]
    public async Task Pay_Twice_Throws()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        var draft = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));
        await sut.PayAsync(draft.Id);

        await Assert.ThrowsAsync<ConflictException>(() => sut.PayAsync(draft.Id));
    }

    // ---------- Cancel rules ----------

    [Fact]
    public async Task Cancel_FromDraft_Succeeds()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        var draft = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));
        var cancelled = await sut.CancelAsync(draft.Id);
        Assert.Equal(PolicyStatus.Cancelled, cancelled.Status);
    }

    [Fact]
    public async Task Cancel_FromActive_Succeeds()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        var draft = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));
        await sut.PayAsync(draft.Id);
        var cancelled = await sut.CancelAsync(draft.Id);
        Assert.Equal(PolicyStatus.Cancelled, cancelled.Status);
    }

    [Fact]
    public async Task Cancel_FromCancelled_Throws()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        var draft = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));
        await sut.CancelAsync(draft.Id);

        await Assert.ThrowsAsync<InvalidStateTransitionException>(() => sut.CancelAsync(draft.Id));
    }

    // ---------- StartDate validation ----------

    [Fact]
    public async Task Create_StartDateTodayOrEarlier_Throws()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        foreach (var start in new[] { Today.AddDays(-1), Today })
        {
            var ex = await Assert.ThrowsAsync<ValidationException>(() =>
                sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", start, 12, null)));
            Assert.Equal(PolicyValidation.Messages.StartDateTooEarly, ex.Errors["StartDate"][0]);
        }
    }

    [Fact]
    public async Task Create_StartDateMoreThan60DaysAhead_Throws()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Today.AddDays(61), 12, null)));
    }

    // ---------- Past claims affect pricing ----------

    [Fact]
    public async Task Create_AfterApprovedClaim_PremiumIsHigher()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var user = fixture.Db.Users.First();
        var sut = NewSut(fixture.Db, Client(user.Id, customerId));

        // First MTPL policy to hang a claim off — pay it so it's Active.
        var mtpl = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, null));
        await sut.PayAsync(mtpl.Id);

        // Clean-record CASCO quote (0 prior claims): record its premium then
        // cancel so it doesn't collide with the second CASCO we create.
        var cascoClean = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "CASCO", Tomorrow, 12, null));
        await sut.CancelAsync(cascoClean.Id);

        // Attach an Approved claim with a recent incident date to the MTPL.
        fixture.Db.Claims.Add(new Claim
        {
            Id = Guid.NewGuid(),
            PolicyId = mtpl.Id,
            ClaimNumber = $"C-{Guid.NewGuid():N}"[..16],
            IncidentDate = DateTime.UtcNow.AddMonths(-6),
            Description = "Minor collision",
            ClaimedAmount = 1500m,
            ApprovedAmount = 1500m,
            Status = ClaimStatus.Approved,
            CreatedAt = DateTime.UtcNow
        });
        await fixture.Db.SaveChangesAsync();

        // New CASCO quote now sees one claim in the last 3 years.
        var cascoWithClaim = await sut.CreateAsync(new CreatePolicyRequest(vehicleId, "CASCO", Tomorrow, 12, null));

        Assert.True(cascoWithClaim.Premium > cascoClean.Premium,
            $"Expected premium after claim ({cascoWithClaim.Premium}) to exceed clean-record premium ({cascoClean.Premium}).");
    }

    // ---------- Pagination ----------

    [Fact]
    public async Task List_PageSizeClampedToFifty()
    {
        using var fixture = new SqliteTestDb();
        var admin = Admin(Guid.NewGuid());
        var sut = NewSut(fixture.Db, admin);

        var result = await sut.ListAsync(new ListPoliciesQuery(PageSize: 500));
        Assert.Equal(50, result.PageSize);
    }

    [Fact]
    public async Task List_AdminSeesAllAcrossCustomers_PaginationCountsStable()
    {
        using var fixture = new SqliteTestDb();
        var customerAId = SeedCustomer(fixture.Db, "a@example.com");
        var customerBId = SeedCustomer(fixture.Db, "b@example.com");
        var vehicleA = SeedVehicle(fixture.Db, customerAId, plate: "A-001");
        var vehicleB = SeedVehicle(fixture.Db, customerBId, plate: "B-001");

        var userA = fixture.Db.Users.First(u => u.Email == "a@example.com").Id;
        var userB = fixture.Db.Users.First(u => u.Email == "b@example.com").Id;

        await NewSut(fixture.Db, Client(userA, customerAId))
            .CreateAsync(new CreatePolicyRequest(vehicleA, "MTPL", Tomorrow, 12, null));
        await NewSut(fixture.Db, Client(userB, customerBId))
            .CreateAsync(new CreatePolicyRequest(vehicleB, "MTPL", Tomorrow, 12, null));

        var adminView = await NewSut(fixture.Db, Admin(Guid.NewGuid()))
            .ListAsync(new ListPoliciesQuery(PageSize: 10));
        Assert.Equal(2, adminView.TotalCount);
    }

    // ---------- Role-aware filtering ----------

    [Fact]
    public async Task List_Client_SeesOnlyOwnPolicies()
    {
        using var fixture = new SqliteTestDb();
        var customerAId = SeedCustomer(fixture.Db, "a@example.com");
        var customerBId = SeedCustomer(fixture.Db, "b@example.com");
        var vehicleA = SeedVehicle(fixture.Db, customerAId, plate: "A-001");
        var vehicleB = SeedVehicle(fixture.Db, customerBId, plate: "B-001");

        var userA = fixture.Db.Users.First(u => u.Email == "a@example.com").Id;
        var userB = fixture.Db.Users.First(u => u.Email == "b@example.com").Id;

        await NewSut(fixture.Db, Client(userA, customerAId))
            .CreateAsync(new CreatePolicyRequest(vehicleA, "MTPL", Tomorrow, 12, null));
        await NewSut(fixture.Db, Client(userB, customerBId))
            .CreateAsync(new CreatePolicyRequest(vehicleB, "MTPL", Tomorrow, 12, null));

        var aliceSees = await NewSut(fixture.Db, Client(userA, customerAId))
            .ListAsync(new ListPoliciesQuery(PageSize: 10));
        Assert.Single(aliceSees.Items);
        Assert.Equal(customerAId, aliceSees.Items.Single().CustomerId);
    }

    [Fact]
    public async Task List_Agent_SeesOnlyPoliciesTheyCreated()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);

        // Agents are real User rows — FK to User(AgentId) requires them to exist.
        var agent1Id = SeedUser(fixture.Db, "agent1@example.com", UserRole.Agent);
        var agent2Id = SeedUser(fixture.Db, "agent2@example.com", UserRole.Agent);

        // The customer moves from one agent's book to the other's in between.
        AssignAgent(fixture.Db, customerId, agent1Id);
        await NewSut(fixture.Db, Agent(agent1Id))
            .CreateAsync(new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, customerId));
        AssignAgent(fixture.Db, customerId, agent2Id);
        await NewSut(fixture.Db, Agent(agent2Id))
            .CreateAsync(new CreatePolicyRequest(vehicleId, "CASCO", Tomorrow, 12, customerId));

        var agent1View = await NewSut(fixture.Db, Agent(agent1Id)).ListAsync(new ListPoliciesQuery(PageSize: 10));
        Assert.Single(agent1View.Items);
        Assert.Equal(agent1Id, agent1View.Items.Single().AgentId);
    }

    [Fact]
    public async Task Agent_cannot_quote_or_sell_to_a_customer_outside_their_book()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture.Db);
        var vehicleId = SeedVehicle(fixture.Db, customerId);
        var mine = SeedUser(fixture.Db, "agent1@example.com", UserRole.Agent);
        var other = SeedUser(fixture.Db, "agent2@example.com", UserRole.Agent);
        AssignAgent(fixture.Db, customerId, other);
        var request = new CreatePolicyRequest(vehicleId, "MTPL", Tomorrow, 12, customerId);

        // 404, as for an unknown customer: whose book it is stays private.
        await Assert.ThrowsAsync<NotFoundException>(() => NewSut(fixture.Db, Agent(mine)).QuoteAsync(request));
        await Assert.ThrowsAsync<NotFoundException>(() => NewSut(fixture.Db, Agent(mine)).CreateAsync(request));
        Assert.Empty(fixture.Db.Policies);
    }

    private static void AssignAgent(AppDbContext db, Guid customerId, Guid agentId)
    {
        db.Customers.Single(c => c.Id == customerId).AgentId = agentId;
        db.SaveChanges();
    }

    private static Guid SeedUser(AppDbContext db, string email, UserRole role)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = "n/a",
            FullName = email,
            Role = role,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        db.SaveChanges();
        return user.Id;
    }
}
