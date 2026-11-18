using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Dtos;
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
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Tests.Claims;

public class ClaimServiceTests
{
    private static DateTime Today => DateTime.UtcNow.Date;

    private static IOptions<ClaimOptions> DefaultOptions() =>
        Options.Create(new ClaimOptions { MaxClaimAmount = 50_000m });

    private sealed record SeededClient(
        Guid UserId, Guid CustomerId, Guid VehicleId, Guid PolicyId, string PolicyNumber);

    private static SeededClient SeedActiveClient(
        AppDbContext db,
        string email = "client@example.com",
        DateTime? policyStart = null,
        DateTime? policyEnd = null)
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
            BirthDate = DateTime.UtcNow.AddYears(-36).Date,
            DrivingLicenseDate = DateTime.UtcNow.AddYears(-15).Date,
            CreatedAt = DateTime.UtcNow
        };
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            Make = "Toyota",
            Model = "Corolla",
            Year = 2020,
            EngineCapacityCc = 1800,
            PlateNumber = $"P{Guid.NewGuid():N}"[..8].ToUpperInvariant(),
            Vin = $"V{Guid.NewGuid():N}"[..17].ToUpperInvariant()
        };
        var policyType = db.PolicyTypes.First(pt => pt.Code == "MTPL");
        var policy = new Policy
        {
            Id = Guid.NewGuid(),
            PolicyNumber = $"PG-2026-{Guid.NewGuid():N}"[..16].ToUpperInvariant(),
            CustomerId = customer.Id,
            VehicleId = vehicle.Id,
            PolicyTypeId = policyType.Id,
            StartDate = policyStart ?? Today.AddMonths(-1),
            EndDate = policyEnd ?? Today.AddMonths(11),
            Premium = 100m,
            Status = PolicyStatus.Active,
            CreatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        db.Customers.Add(customer);
        db.Vehicles.Add(vehicle);
        db.Policies.Add(policy);
        db.SaveChanges();

        return new SeededClient(user.Id, customer.Id, vehicle.Id, policy.Id, policy.PolicyNumber);
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

    // Each call uses its own DbContext over the shared connection, matching
    // the per-request scoped lifetime in production. This stops change-tracker
    // state from one service call from leaking into the next.
    private static ClaimService NewSut(SqliteTestDb fixture, ICurrentUser user) =>
        new(fixture.NewContext(), user, new FakePayoutStub(), DefaultOptions());

    private static FakeCurrentUser Client(SeededClient seed) => new()
    {
        UserId = seed.UserId,
        Role = UserRole.Client,
        CustomerId = seed.CustomerId
    };

    private static SubmitClaimRequest ValidSubmit(SeededClient seed, decimal amount = 1_000m) =>
        new(seed.PolicyId, Today.AddDays(-3), "Rear-end collision at intersection.", amount, null,
            IncidentType.Collision, "Baku, Nizami street");

    // ---------- Submit ----------

    [Fact]
    public async Task Submit_SavesClaimAndWritesInitialHistoryRow()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var sut = NewSut(fixture, Client(seed));

        var response = await sut.SubmitAsync(ValidSubmit(seed));

        Assert.Equal(ClaimStatus.Submitted, response.Status);
        Assert.StartsWith("CL-", response.ClaimNumber);

        var history = await fixture.Db.ClaimStatusHistory
            .Where(h => h.ClaimId == response.Id).ToListAsync();
        Assert.Single(history);
        Assert.Null(history[0].FromStatus);
        Assert.Equal(ClaimStatus.Submitted, history[0].ToStatus);
    }

    [Fact]
    public async Task Submit_PolicyNotActive_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        // Flip policy to Draft.
        var policy = fixture.Db.Policies.First();
        policy.Status = PolicyStatus.Draft;
        await fixture.Db.SaveChangesAsync();

        var sut = NewSut(fixture, Client(seed));

        await Assert.ThrowsAsync<ValidationException>(() => sut.SubmitAsync(ValidSubmit(seed)));
    }

    [Fact]
    public async Task Submit_IncidentBeforePolicy_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db, policyStart: Today.AddMonths(-1), policyEnd: Today.AddMonths(11));
        var sut = NewSut(fixture, Client(seed));

        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.SubmitAsync(ValidSubmit(seed) with { IncidentDate = Today.AddMonths(-2) }));
    }

    [Fact]
    public async Task Submit_IncidentInFuture_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var sut = NewSut(fixture, Client(seed));

        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.SubmitAsync(ValidSubmit(seed) with { IncidentDate = Today.AddDays(1) }));
    }

    [Fact]
    public async Task Submit_Duplicate_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var sut = NewSut(fixture, Client(seed));
        await sut.SubmitAsync(ValidSubmit(seed));

        await Assert.ThrowsAsync<ConflictException>(() => sut.SubmitAsync(ValidSubmit(seed)));
    }

    [Fact]
    public async Task Submit_AboveMaxAmount_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var sut = NewSut(fixture, Client(seed));

        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.SubmitAsync(ValidSubmit(seed, amount: 100_000m)));
    }

    // ---------- Ownership 404 ----------

    [Fact]
    public async Task GetById_ClientReadsOthersClaim_NotFound()
    {
        using var fixture = new SqliteTestDb();
        var a = SeedActiveClient(fixture.Db, "a@example.com");
        var b = SeedActiveClient(fixture.Db, "b@example.com");

        var submittedByA = await NewSut(fixture, Client(a)).SubmitAsync(ValidSubmit(a));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewSut(fixture, Client(b)).GetByIdAsync(submittedByA.Id));
    }

    // ---------- Only assigned adjuster can finalise ----------

    [Fact]
    public async Task Approve_ByUnassignedAdjuster_IsInvisible404()
    {
        // The Adjuster role filter only returns unassigned claims or those
        // already assigned to the caller. A second adjuster trying to approve
        // somebody else's claim therefore gets a 404 (NotFound) before the
        // entity-level guard runs — 404-for-not-yours is consistent across
        // the whole API.
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var assigned = SeedUser(fixture.Db, "assigned@example.com", UserRole.Adjuster);
        var someoneElse = SeedUser(fixture.Db, "other@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture,
            new FakeCurrentUser { UserId = assigned, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest("mine"));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewSut(fixture,
                    new FakeCurrentUser { UserId = someoneElse, Role = UserRole.Adjuster })
                .ApproveAsync(submitted.Id, new ApproveClaimRequest(500m, "steal")));
    }

    [Fact]
    public async Task Approve_ByNonAssignedAdjuster_EntityLevelGuardThrows()
    {
        // Exercise the entity guard directly via the Admin role (which can
        // see anyone's claim) acting as if they were an unassigned adjuster.
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var assigned = SeedUser(fixture.Db, "assigned@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture,
            new FakeCurrentUser { UserId = assigned, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));

        // Pull a tracked claim via a fresh context and invoke the entity
        // method directly without the Admin flag — that triggers the guard.
        await using var ctx = fixture.NewContext();
        var claim = await ctx.Claims.FirstAsync(c => c.Id == submitted.Id);
        Assert.Throws<InvalidStateTransitionException>(
            () => claim.Approve(500m, Guid.NewGuid(), "sneaky"));
    }

    [Fact]
    public async Task Approve_AboveClaimedAmount_IsAFieldError()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var adjusterId = SeedUser(fixture.Db, "adj@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed))
            .SubmitAsync(ValidSubmit(seed, amount: 500m));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));

        // A 400 on the field (the form shows it inline), not a state conflict.
        var error = await Assert.ThrowsAsync<ValidationException>(() =>
            NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
                .ApproveAsync(submitted.Id, new ApproveClaimRequest(600m, "too high")));
        Assert.Equal([ClaimValidation.Messages.ApprovedAmountAboveClaimed], error.Errors["approvedAmount"]);
    }

    [Fact]
    public async Task Reject_WithoutReason_IsAFieldError()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var adjusterId = SeedUser(fixture.Db, "adj@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));

        var error = await Assert.ThrowsAsync<ValidationException>(() =>
            NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
                .RejectAsync(submitted.Id, new RejectClaimRequest("   ")));
        Assert.Equal([ClaimValidation.Messages.RejectionReasonRequired], error.Errors["comment"]);
    }

    // ---------- Pay flow ----------

    [Fact]
    public async Task Pay_FromApproved_WorksAndWritesHistory()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var adjusterId = SeedUser(fixture.Db, "adj@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ApproveAsync(submitted.Id, new ApproveClaimRequest(800m, "ok"));

        var paid = await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .PayAsync(submitted.Id, new PayClaimRequest("settled"));

        Assert.Equal(ClaimStatus.Paid, paid.Status);
        var history = await fixture.Db.ClaimStatusHistory
            .Where(h => h.ClaimId == submitted.Id)
            .OrderBy(h => h.ChangedAt).ToListAsync();
        Assert.Equal(4, history.Count); // Submit, Review, Approve, Pay
    }

    // ---------- Concurrency ----------

    [Fact]
    public async Task Concurrency_TwoApprovalsOnSameClaim_SecondSaveThrowsConcurrency()
    {
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var adjusterId = SeedUser(fixture.Db, "adj@example.com", UserRole.Adjuster);

        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));

        // Two independent DbContexts simulate two adjuster browser tabs. They
        // share the same underlying SQLite connection, so both see the current
        // row but the second SaveChanges has a stale RowVersion.
        using var left = new DbContextWrapper(fixture);
        using var right = new DbContextWrapper(fixture);

        var claimLeft = await left.Context.Claims
            .FirstAsync(c => c.Id == submitted.Id);
        var claimRight = await right.Context.Claims
            .FirstAsync(c => c.Id == submitted.Id);

        // Both approve. Left wins; right should throw on save.
        claimLeft.Approve(500m, adjusterId, "left");
        await left.Context.SaveChangesAsync();

        claimRight.Approve(500m, adjusterId, "right");
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() =>
            right.Context.SaveChangesAsync());
    }

    // ---------- Approved claim feeds bonus-malus end-to-end ----------

    [Fact]
    public async Task ApprovedClaim_IncreasesNextPolicyPremium()
    {
        // Seeds through the full lifecycle: client submits, adjuster approves.
        // Then PolicyService creates a new policy and premium reflects 1 claim.
        using var fixture = new SqliteTestDb();
        var seed = SeedActiveClient(fixture.Db);
        var adjusterId = SeedUser(fixture.Db, "adj@example.com", UserRole.Adjuster);

        // Baseline: premium with zero prior claims via a second policy type.
        var policies = new PolicyService(
            fixture.Db, new PremiumCalculator(), new StubPaymentGateway(), Client(seed));
        var cleanQuote = await policies.CreateAsync(new CreatePolicyRequest(
            seed.VehicleId, "CASCO", DateOnly.FromDateTime(Today), 12, null));
        await policies.CancelAsync(cleanQuote.Id);

        // Client submits a claim; adjuster reviews + approves.
        var submitted = await NewSut(fixture, Client(seed)).SubmitAsync(ValidSubmit(seed));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ReviewAsync(submitted.Id, new ReviewClaimRequest(null));
        await NewSut(fixture, new FakeCurrentUser { UserId = adjusterId, Role = UserRole.Adjuster })
            .ApproveAsync(submitted.Id, new ApproveClaimRequest(500m, "ok"));

        // New CASCO policy — the premium now reflects one Approved claim.
        var afterClaim = await policies.CreateAsync(new CreatePolicyRequest(
            seed.VehicleId, "CASCO", DateOnly.FromDateTime(Today), 12, null));

        Assert.True(afterClaim.Premium > cleanQuote.Premium,
            $"Expected premium after approved claim ({afterClaim.Premium}) to exceed clean-record ({cleanQuote.Premium}).");
    }

    // ---------- Role-aware list ----------

    [Fact]
    public async Task List_Client_SeesOnlyOwnClaims()
    {
        using var fixture = new SqliteTestDb();
        var a = SeedActiveClient(fixture.Db, "a@example.com");
        var b = SeedActiveClient(fixture.Db, "b@example.com");
        await NewSut(fixture, Client(a)).SubmitAsync(ValidSubmit(a));
        await NewSut(fixture, Client(b)).SubmitAsync(ValidSubmit(b));

        var list = await NewSut(fixture, Client(a))
            .ListAsync(new ListClaimsFilter(null, null, null, null, 1, 20));
        Assert.Single(list.Items);
    }

    [Fact]
    public async Task List_Adjuster_SeesUnassignedPlusOwnAssigned()
    {
        using var fixture = new SqliteTestDb();
        var a = SeedActiveClient(fixture.Db, "a@example.com");
        var b = SeedActiveClient(fixture.Db, "b@example.com");
        var c = SeedActiveClient(fixture.Db, "c@example.com");

        var meAdj = SeedUser(fixture.Db, "me-adj@example.com", UserRole.Adjuster);
        var otherAdj = SeedUser(fixture.Db, "other-adj@example.com", UserRole.Adjuster);

        var claimA = await NewSut(fixture, Client(a)).SubmitAsync(ValidSubmit(a));
        var claimB = await NewSut(fixture, Client(b)).SubmitAsync(ValidSubmit(b));
        var claimC = await NewSut(fixture, Client(c)).SubmitAsync(ValidSubmit(c));

        // claimA → mine. claimB → other adjuster's. claimC stays unassigned.
        await NewSut(fixture, new FakeCurrentUser { UserId = meAdj, Role = UserRole.Adjuster })
            .ReviewAsync(claimA.Id, new ReviewClaimRequest(null));
        await NewSut(fixture, new FakeCurrentUser { UserId = otherAdj, Role = UserRole.Adjuster })
            .ReviewAsync(claimB.Id, new ReviewClaimRequest(null));

        var list = await NewSut(fixture,
                new FakeCurrentUser { UserId = meAdj, Role = UserRole.Adjuster })
            .ListAsync(new ListClaimsFilter(null, null, null, null, 1, 20));

        // Visible: my own (A) and the unassigned (C). Not B (someone else's).
        Assert.Equal(2, list.TotalCount);
        var ids = list.Items.Select(i => i.Id).ToHashSet();
        Assert.Contains(claimA.Id, ids);
        Assert.Contains(claimC.Id, ids);
        Assert.DoesNotContain(claimB.Id, ids);
    }

    // ---------- Pagination size clamp ----------

    [Fact]
    public async Task List_PageSizeClampedToFifty()
    {
        using var fixture = new SqliteTestDb();
        var sut = NewSut(fixture,
            new FakeCurrentUser { UserId = Guid.NewGuid(), Role = UserRole.Admin });

        var result = await sut.ListAsync(new ListClaimsFilter(null, null, null, null, 1, 500));
        Assert.Equal(50, result.PageSize);
    }

    // ---------- Helpers ----------

    // Minimal stub so the ClaimService dependency compiles; payouts aren't
    // the focus of most tests here.
    private sealed class FakePayoutStub : IPayoutGateway
    {
        public Task<PayoutReceipt> PayoutAsync(Guid claimId, decimal amount, CancellationToken ct = default)
            => Task.FromResult(new PayoutReceipt("PAYOUT-TEST", DateTime.UtcNow));
    }

    // Lightweight wrapper that gives us a NEW DbContext over the same SQLite
    // connection so change-tracking state is independent per "session".
    private sealed class DbContextWrapper : IDisposable
    {
        public AppDbContext Context { get; }

        public DbContextWrapper(SqliteTestDb fixture)
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite(fixture.Db.Database.GetDbConnection())
                .Options;
            Context = new AppDbContext(options);
        }

        public void Dispose() => Context.Dispose();
    }
}

