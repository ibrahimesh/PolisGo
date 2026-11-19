using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence.Configurations;

namespace PolisGo.Infrastructure.Persistence;

public enum DemoSeedResult
{
    Disabled,
    RefusedInProduction,
    AlreadySeeded,
    Seeded
}

// Opt-in demo data (Demo:SeedData=true) so the admin dashboard, the queues
// and the audit log have something to show: agents, adjusters, clients,
// vehicles, policies started months ago with their payments, and claims in
// every status with a believable history. Never in Production; idempotent
// (a marker account means it already ran). All demo accounts share one
// password: Demo:Password, or the documented DefaultPassword, never the
// admin's secret.
public static class DemoDataSeeder
{
    public const string Domain = "demo.polisgo.az";
    public const string MarkerEmail = "demo.agent1@" + Domain;
    public const string DefaultPassword = "Demo-Passw0rd";

    private record Person(string Key, string FullName, string Phone, DateOnly Birth, DateOnly Licence);

    private static readonly (string Key, string Name, UserRole Role)[] StaffPeople =
    [
        ("agent1", "Leyla Əliyeva", UserRole.Agent),
        ("agent2", "Tural Hüseynov", UserRole.Agent),
        ("adjuster1", "Rauf Məmmədli", UserRole.Adjuster),
        ("adjuster2", "Səbinə Qasımova", UserRole.Adjuster)
    ];

    private static readonly Person[] Clients =
    [
        new("aysel", "Aysel Həsənova", "+994501112233", new(1988, 4, 12), new(2008, 9, 1)),
        new("kamran", "Kamran Rzayev", "+994552223344", new(1979, 11, 3), new(1999, 6, 15)),
        new("nigar", "Nigar Quliyeva", "+994703334455", new(1995, 2, 20), new(2015, 3, 10)),
        new("elvin", "Elvin Babayev", "+994504445566", new(1990, 7, 7), new(2010, 8, 1)),
        new("gunel", "Günel İsmayılova", "+994515556677", new(1984, 12, 30), new(2006, 5, 5)),
        new("orxan", "Orxan Nəsirov", "+994776667788", new(1999, 1, 25), new(2019, 2, 14)),
        new("lala", "Lalə Abbasova", "+994507778899", new(1972, 5, 18), new(1994, 10, 2)),
        new("ruslan", "Ruslan Kərimov", "+994558889900", new(1993, 9, 9), new(2013, 11, 20))
    ];

    public static async Task<DemoSeedResult> SeedIfEnabledAsync(
        AppDbContext db,
        IConfiguration configuration,
        string environmentName,
        IPasswordHasher passwordHasher,
        IPremiumCalculator calculator,
        TimeProvider clock,
        CancellationToken cancellationToken = default)
    {
        if (!configuration.GetValue<bool>("Demo:SeedData")) return DemoSeedResult.Disabled;
        // Fake people and money must never land in a real database.
        if (string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase))
        {
            return DemoSeedResult.RefusedInProduction;
        }
        if (await db.Users.AnyAsync(u => u.Email == MarkerEmail, cancellationToken))
        {
            return DemoSeedResult.AlreadySeeded;
        }

        var password = configuration["Demo:Password"];
        var hash = passwordHasher.Hash(string.IsNullOrWhiteSpace(password) ? DefaultPassword : password);
        new Builder(db, hash, calculator, clock.GetUtcNow().UtcDateTime).Build();
        await db.SaveChangesAsync(cancellationToken);
        return DemoSeedResult.Seeded;
    }

    private sealed class Builder(AppDbContext db, string passwordHash, IPremiumCalculator calculator, DateTime now)
    {
        private readonly Dictionary<string, User> _staff = new();
        private readonly Dictionary<string, (User User, Customer Customer)> _clients = new();
        private readonly Dictionary<Guid, decimal> _baseRates = new()
        {
            [PolicyTypeConfiguration.MtplId] = 50.00m,
            [PolicyTypeConfiguration.CascoId] = 250.00m
        };
        private int _policySeq;
        private int _claimSeq;
        private int _plateSeq;

        private DateTime Today => now.Date;

        public void Build()
        {
            foreach (var (key, name, role) in StaffPeople)
            {
                _staff[key] = AddUser($"demo.{key}@{Domain}", name, role, Today.AddMonths(-15));
            }
            foreach (var person in Clients)
            {
                var user = AddUser($"demo.{person.Key}@{Domain}", person.FullName, UserRole.Client, Today.AddMonths(-14));
                var customer = new Customer
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    FullName = person.FullName,
                    Email = user.Email,
                    Phone = person.Phone,
                    BirthDate = person.Birth.ToDateTime(TimeOnly.MinValue),
                    DrivingLicenseDate = person.Licence.ToDateTime(TimeOnly.MinValue),
                    CreatedAt = user.CreatedAt
                };
                db.Customers.Add(customer);
                _clients[person.Key] = (user, customer);
            }

            // Books: agent1 looks after four customers, agent2 three, one has none.
            Assign("aysel", "agent1"); Assign("kamran", "agent1"); Assign("nigar", "agent1"); Assign("elvin", "agent1");
            Assign("gunel", "agent2"); Assign("orxan", "agent2"); Assign("lala", "agent2");

            var adjuster1 = _staff["adjuster1"];
            var adjuster2 = _staff["adjuster2"];

            // Policies started months ago; agent sales for assigned customers.
            var aysel = Policy("aysel", "Toyota", "Corolla", 2019, 1800, PolicyTypeConfiguration.MtplId, monthsAgo: 10, agent: "agent1");
            var ayselCasco = Policy("aysel", "Toyota", "Corolla", 2019, 1800, PolicyTypeConfiguration.CascoId, monthsAgo: 4, agent: "agent1", sameVehicleAs: aysel);
            var kamran = Policy("kamran", "Hyundai", "Elantra", 2017, 2000, PolicyTypeConfiguration.MtplId, monthsAgo: 13, agent: "agent1"); // expired
            var kamranRenewal = Policy("kamran", "Hyundai", "Elantra", 2017, 2000, PolicyTypeConfiguration.MtplId, monthsAgo: 1, agent: "agent1", sameVehicleAs: kamran);
            var nigar = Policy("nigar", "Kia", "Rio", 2021, 1400, PolicyTypeConfiguration.CascoId, monthsAgo: 8, agent: "agent1");
            var elvin = Policy("elvin", "Mercedes-Benz", "E 200", 2020, 2000, PolicyTypeConfiguration.CascoId, monthsAgo: 6, agent: "agent1");
            var gunel = Policy("gunel", "Chevrolet", "Cobalt", 2018, 1500, PolicyTypeConfiguration.MtplId, monthsAgo: 11, agent: "agent2");
            var orxan = Policy("orxan", "Lada", "Vesta", 2022, 1600, PolicyTypeConfiguration.MtplId, monthsAgo: 3, agent: "agent2");
            var lala = Policy("lala", "Nissan", "Qashqai", 2016, 2000, PolicyTypeConfiguration.CascoId, monthsAgo: 7, agent: "agent2");
            var ruslan = Policy("ruslan", "Honda", "Civic", 2015, 1800, PolicyTypeConfiguration.MtplId, monthsAgo: 5, agent: null);
            Policy("orxan", "Lada", "Vesta", 2022, 1600, PolicyTypeConfiguration.CascoId, monthsAgo: 2, agent: "agent2", sameVehicleAs: orxan, cancelAfterDays: 9);
            Policy("ruslan", "Honda", "Civic", 2015, 1800, PolicyTypeConfiguration.CascoId, monthsAgo: 0, agent: null, sameVehicleAs: ruslan, unpaid: true);
            _ = ayselCasco;

            // Claims in every status, each with its full history.
            Claim(kamran, "kamran", 9, IncidentType.Collision, "Bakı, Nizami küçəsi 10",
                "Rear bumper hit at a red light; the other driver admitted fault.", 1240m,
                (ClaimStatus.UnderReview, 1, adjuster1, null), (ClaimStatus.Approved, 4, adjuster1, 1190m), (ClaimStatus.Paid, 6, adjuster1, null));
            Claim(nigar, "nigar", 5, IncidentType.Glass, "Bakı–Sumqayıt yolu, 12-ci km",
                "A stone from a truck cracked the windscreen.", 480m,
                (ClaimStatus.UnderReview, 2, adjuster2, null), (ClaimStatus.Approved, 3, adjuster2, 480m), (ClaimStatus.Paid, 5, adjuster2, null));
            Claim(gunel, "gunel", 6, IncidentType.Vandalism, "Gəncə, Atatürk prospekti 5",
                "Both mirrors broken while parked overnight.", 900m,
                (ClaimStatus.UnderReview, 2, adjuster1, null), (ClaimStatus.Rejected, 6, adjuster1, "The damage shown predates the policy start."));
            Claim(elvin, "elvin", 2, IncidentType.Collision, "Bakı, Heydər Əliyev prospekti",
                "Side panel scraped by a reversing van in a car park.", 2150m,
                (ClaimStatus.UnderReview, 1, adjuster2, null), (ClaimStatus.Approved, 5, adjuster2, 1980m));
            Claim(lala, "lala", 3, IncidentType.NaturalHazard, "Şamaxı, Təbriz küçəsi",
                "Hail dented the bonnet and roof.", 3400m,
                (ClaimStatus.UnderReview, 3, adjuster1, null));
            Claim(aysel, "aysel", 1, IncidentType.Theft, "Bakı, 28 May metrosu yanı",
                "Side mirror stolen overnight.", 320m,
                (ClaimStatus.UnderReview, 1, adjuster2, null));
            Claim(orxan, "orxan", 1, IncidentType.Other, "Sumqayıt, Sülh küçəsi",
                "Door dented by a shopping trolley.", 260m);
            Claim(kamranRenewal, "kamran", 0, IncidentType.Glass, "Bakı, Neftçilər prospekti",
                "Headlight cracked by gravel.", 180m);
            Claim(ruslan, "ruslan", 2, IncidentType.Collision, "Bakı, Babək prospekti",
                "Minor scrape, settled privately in the end.", 400m,
                (ClaimStatus.Withdrawn, 3, null, "Settled with the other driver."));
        }

        private User AddUser(string email, string name, UserRole role, DateTime createdAt)
        {
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                PasswordHash = passwordHash,
                FullName = name,
                Role = role,
                CreatedAt = createdAt
            };
            db.Users.Add(user);
            return user;
        }

        private void Assign(string client, string agent) => _clients[client].Customer.AgentId = _staff[agent].Id;

        private readonly Dictionary<Policy, Vehicle> _vehicles = new();

        private Policy Policy(
            string client, string make, string model, int year, int engineCc, Guid typeId, int monthsAgo,
            string? agent, Policy? sameVehicleAs = null, int? cancelAfterDays = null, bool unpaid = false)
        {
            var (user, customer) = _clients[client];
            var vehicle = sameVehicleAs is not null ? _vehicles[sameVehicleAs] : AddVehicle(customer, make, model, year, engineCc);

            // Cover starts monthsAgo (a few days in, so dates vary); unpaid
            // drafts start a week from now.
            var start = unpaid ? Today.AddDays(7) : Today.AddMonths(-monthsAgo).AddDays(-(_policySeq % 5) - 1);
            var created = unpaid ? Today.AddDays(-1) : start.AddDays(-2).AddHours(10);
            var typeCode = typeId == PolicyTypeConfiguration.MtplId ? "MTPL" : "CASCO";
            var breakdown = calculator.Calculate(new PremiumCalculationInput(
                typeCode, _baseRates[typeId], vehicle.EngineCapacityCc,
                DateOnly.FromDateTime(customer.BirthDate), DateOnly.FromDateTime(customer.DrivingLicenseDate),
                vehicle.Year, 0, 12, DateOnly.FromDateTime(created)));

            var actor = agent is null ? user.Id : _staff[agent].Id;
            var policy = new Policy
            {
                Id = Guid.NewGuid(),
                PolicyNumber = $"PG-{start.Year}-DEMO{++_policySeq:0000}",
                CustomerId = customer.Id,
                VehicleId = vehicle.Id,
                PolicyTypeId = typeId,
                AgentId = agent is null ? null : _staff[agent].Id,
                StartDate = start,
                EndDate = start.AddMonths(12).AddDays(-1),
                Premium = breakdown.Premium,
                Status = PolicyStatus.Draft,
                CreatedAt = created,
                Pricing = new PolicyPricing
                {
                    BaseRate = breakdown.BaseRate,
                    EngineFactor = breakdown.EngineFactor,
                    DriverAgeFactor = breakdown.DriverAgeFactor,
                    ExperienceFactor = breakdown.ExperienceFactor,
                    VehicleAgeFactor = breakdown.VehicleAgeFactor,
                    BonusMalusFactor = breakdown.BonusMalusFactor,
                    TermFactor = breakdown.TermFactor,
                    TotalFactor = breakdown.TotalFactor
                }
            };
            policy.StatusHistory.Add(new PolicyStatusHistory
            {
                FromStatus = null, ToStatus = PolicyStatus.Draft, ChangedByUserId = actor, ChangedAt = created
            });

            if (!unpaid)
            {
                var paidAt = created.AddHours(1);
                db.Payments.Add(new Payment
                {
                    Id = Guid.NewGuid(),
                    PolicyId = policy.Id,
                    Amount = policy.Premium,
                    PaidAt = paidAt,
                    Method = PaymentMethod.Online,
                    Status = PaymentStatus.Completed,
                    Reference = $"DEMO-{_policySeq:0000}"
                });
                policy.Status = PolicyStatus.Active;
                policy.StatusHistory.Add(new PolicyStatusHistory
                {
                    FromStatus = PolicyStatus.Draft, ToStatus = PolicyStatus.Active, ChangedByUserId = actor, ChangedAt = paidAt
                });
            }
            if (cancelAfterDays is { } days)
            {
                policy.Status = PolicyStatus.Cancelled;
                policy.StatusHistory.Add(new PolicyStatusHistory
                {
                    FromStatus = PolicyStatus.Active, ToStatus = PolicyStatus.Cancelled, ChangedByUserId = user.Id,
                    ChangedAt = start.AddDays(days).AddHours(15)
                });
            }

            db.Policies.Add(policy);
            _vehicles[policy] = vehicle;
            return policy;
        }

        private Vehicle AddVehicle(Customer customer, string make, string model, int year, int engineCc)
        {
            var n = ++_plateSeq;
            var vehicle = new Vehicle
            {
                Id = Guid.NewGuid(),
                CustomerId = customer.Id,
                Make = make,
                Model = model,
                Year = year,
                EngineCapacityCc = engineCc,
                PlateNumber = $"90-DM-{n:000}",
                Vin = $"DEMO0000000000{n:000}"
            };
            db.Vehicles.Add(vehicle);
            return vehicle;
        }

        // steps: (status, days after the previous step, actor, amount or reason).
        private void Claim(
            Policy policy, string client, int monthsAgo, IncidentType type, string location, string description,
            decimal claimed, params (ClaimStatus Status, int Days, User? By, object? Extra)[] steps)
        {
            var (user, _) = _clients[client];
            // Inside the cover and not in the future.
            var incident = Max(policy.StartDate.AddDays(3), Today.AddMonths(-monthsAgo).AddDays(-4));
            if (incident > Today) incident = Today;
            var filed = incident.AddDays(1).AddHours(11);
            if (filed > now) filed = now.AddHours(-2);

            var claim = new Claim
            {
                Id = Guid.NewGuid(),
                ClaimNumber = $"CL-{filed.Year}-DEMO{++_claimSeq:0000}",
                PolicyId = policy.Id,
                IncidentDate = incident,
                IncidentType = type,
                Location = location,
                Description = description,
                ClaimedAmount = claimed,
                Status = ClaimStatus.Submitted,
                CreatedAt = filed
            };
            claim.StatusHistory.Add(new ClaimStatusHistory
            {
                FromStatus = null, ToStatus = ClaimStatus.Submitted, ChangedByUserId = user.Id,
                Comment = "Claim submitted.", ChangedAt = filed
            });

            var at = filed;
            foreach (var (status, days, by, extra) in steps)
            {
                at = at.AddDays(days).AddHours(2);
                if (at > now) at = now.AddMinutes(-30);
                var comment = status switch
                {
                    ClaimStatus.UnderReview => "Checking the photos and the report.",
                    ClaimStatus.Approved => "Approved after the garage estimate.",
                    ClaimStatus.Paid => "Paid out to the customer's account.",
                    _ => extra as string ?? string.Empty
                };
                claim.StatusHistory.Add(new ClaimStatusHistory
                {
                    FromStatus = claim.Status, ToStatus = status, ChangedByUserId = (by ?? user).Id,
                    Comment = comment, ChangedAt = at
                });
                claim.Status = status;
                if (status == ClaimStatus.UnderReview) claim.AssignedAdjusterId = by!.Id;
                if (status == ClaimStatus.Approved) claim.ApprovedAmount = (decimal)extra!;
            }
            db.Claims.Add(claim);
        }

        private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
    }
}
