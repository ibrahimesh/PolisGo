using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Common;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// The migrations' data backfills run only on SQL Server, and CI otherwise
// only migrates an empty database. Here rows written in the old schema go
// through each backfill, then through every later migration.
[Trait("Category", "SqlServer")]
public class MigrationBackfillTests
{
    private const string BeforeBackfills = "20261117193205_CustomerDirectoryIndexes";
    private const string PolicyHistory = "20261118003359_PolicyHistoryAndPricing";
    private const string CustomerAgent = "20261118192153_CustomerAgent";
    private const string AdminPanel = "20261119221821_AdminPanel";
    private const string Mtpl = "11111111-1111-1111-1111-111111111111";

    [SqlServerFact]
    public async Task Backfills_turn_existing_rows_into_history_books_and_stamps()
    {
        using var db = new SqlServerTestDb(BeforeBackfills);
        var (agent1, agent2, client) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var (customer, walkIn, vehicle) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var (paid, draft, selfService) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

        await using (var old = db.NewContext())
        {
            // The schema as it was: no history, no Customer.AgentId, no stamps.
            await old.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO Users (Id, Email, PasswordHash, FullName, Role, CreatedAt) VALUES
                  ({agent1}, 'a1@old.test', 'x', 'Agent One', 'Agent', '2025-12-01'),
                  ({agent2}, 'a2@old.test', 'x', 'Agent Two', 'Agent', '2025-12-01'),
                  ({client}, 'c@old.test', 'x', 'Old Client', 'Client', '2025-12-01');
                INSERT INTO Customers (Id, UserId, FullName, Email, Phone, BirthDate, DrivingLicenseDate, CreatedAt) VALUES
                  ({customer}, {client}, 'Old Client', 'c@old.test', '+994501234567', '1990-01-01', '2010-01-01', '2025-12-01'),
                  ({walkIn}, NULL, 'Walk In', 'w@old.test', '+994501234568', '1985-01-01', '2005-01-01', '2025-12-01');
                INSERT INTO Vehicles (Id, CustomerId, Make, Model, Year, EngineCapacityCc, PlateNumber, Vin) VALUES
                  ({vehicle}, {customer}, 'Kia', 'Rio', 2020, 1400, '10-OL-001', 'VINOLD00000000001');
                INSERT INTO Policies (Id, PolicyNumber, CustomerId, VehicleId, PolicyTypeId, AgentId, StartDate, EndDate, Premium, Status, CreatedAt) VALUES
                  ({paid}, 'PG-OLD-1', {customer}, {vehicle}, {Mtpl}, {agent1}, '2026-01-02', '2027-01-01', 50, 'Active', '2026-01-01T09:00:00'),
                  ({draft}, 'PG-OLD-2', {customer}, {vehicle}, {Mtpl}, {agent2}, '2027-01-02', '2028-01-01', 50, 'Draft', '2026-03-01T09:00:00'),
                  ({selfService}, 'PG-OLD-3', {customer}, {vehicle}, {Mtpl}, NULL, '2026-04-02', '2027-04-01', 50, 'Cancelled', '2026-04-01T09:00:00');
                INSERT INTO Payments (Id, PolicyId, Amount, PaidAt, Method, Status) VALUES
                  (NEWID(), {paid}, 50, '2026-01-01T15:00:00', 'Online', 'Failed'),
                  (NEWID(), {paid}, 50, '2026-01-02T10:00:00', 'Online', 'Completed'),
                  (NEWID(), {selfService}, 50, '2026-04-01T11:00:00', 'Online', 'Completed');
                """);
        }

        // Every policy was issued at CreatedAt (no actor known); paid ones
        // became Active at their first completed payment, failed ones ignored.
        db.Migrate(PolicyHistory);
        await using (var check = db.NewContext())
        {
            var history = await check.PolicyStatusHistory.AsNoTracking().ToListAsync();
            Assert.Equal(3, history.Count(h => h.FromStatus == null && h.ToStatus == Domain.Enums.PolicyStatus.Draft));
            Assert.All(history, h => Assert.Null(h.ChangedByUserId));
            var activations = history.Where(h => h.ToStatus == Domain.Enums.PolicyStatus.Active).ToList();
            Assert.Equal(2, activations.Count);
            Assert.Equal(new DateTime(2026, 1, 2, 10, 0, 0), activations.Single(h => h.PolicyId == paid).ChangedAt);
            Assert.DoesNotContain(activations, h => h.PolicyId == draft);
        }

        // A customer goes to the agent who sold to them most recently.
        db.Migrate(CustomerAgent);
        await using (var check = db.NewContext())
        {
            // Projected: the current model has columns later migrations add.
            var books = await check.Customers.AsNoTracking()
                .Select(c => new { c.Id, c.AgentId }).ToDictionaryAsync(c => c.Id, c => c.AgentId);
            Assert.Equal(agent2, books[customer]);
            Assert.Null(books[walkIn]);
        }

        // Each existing user gets a stamp of their own, and stays active.
        db.Migrate(AdminPanel);
        await using (var check = db.NewContext())
        {
            var users = await check.Users.AsNoTracking()
                .Select(u => new { u.IsActive, u.SecurityStamp }).ToListAsync();
            Assert.Equal(3, users.Count);
            Assert.All(users, u => Assert.True(u.IsActive));
            Assert.DoesNotContain(users, u => u.SecurityStamp == Guid.Empty);
            Assert.Equal(3, users.Select(u => u.SecurityStamp).Distinct().Count());
        }

        // And the rest of the migrations accept that data (one completed
        // payment per policy, so the unique completed-payment index builds).
        db.Migrate();
        await using (var latest = db.NewContext())
        {
            Assert.Equal(3, await latest.Policies.CountAsync());
            Assert.Empty(await latest.Database.GetPendingMigrationsAsync());
        }

        // Old rows have no search key until the startup backfill folds them.
        await using (var latest = db.NewContext())
        {
            Assert.Equal(5, await SearchKeys.BackfillAsync(latest));
            var key = await latest.Customers.AsNoTracking().Where(c => c.Id == walkIn)
                .Select(c => EF.Property<string>(c, SearchText.KeyProperty)).SingleAsync();
            Assert.Equal(SearchText.Key("Walk In", "w@old.test"), key);
            Assert.Equal(0, await SearchKeys.BackfillAsync(latest));
        }
    }
}
