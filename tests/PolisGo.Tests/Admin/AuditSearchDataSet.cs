using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Infrastructure.Persistence.Configurations;

namespace PolisGo.Tests.Admin;

// A production-sized audit log (2,600+ events) with names and emails in
// Latin, Cyrillic and Azerbaijani, for the audit search. Deterministic: the
// same seed gives the same rows on SQLite and SQL Server.
//
// The oracle is independent of the code under test: every person carries
// the search terms that must find them, written by hand, and every event
// lists the people it involves the way the search defines it (the actor,
// the claim's or policy's customer, a staff action's subject and the agent
// named in its values). Expected(term) is the events involving a person
// tagged with that term.
public sealed class AuditSearchDataSet
{
    public sealed record Person(string Name, string Email, UserRole? Role, params string[] Terms)
    {
        public Guid Id { get; } = Guid.NewGuid();
        public bool Matches(string term) => Terms.Contains(term);
    }

    public sealed record Event(Guid Id, DateTime At, Person[] Involves);

    public const int TotalEvents = 2_640;

    // The people the tests search for, and look-alikes that must not match.
    public static readonly Person Admin = new("PolisGo Admin", "admin.dataset@polisgo.test", UserRole.Admin);
    public static readonly Person IbrahimAdmin =
        new("Ibrahim Admin", "ibrahim@polisgo.local", UserRole.Admin, "ibrahim");
    public static readonly Person IbrahimAgent =
        new("İbrahim Şirinov", "i.shirinov@polisgo.test", UserRole.Agent, "ibrahim", "şirinov");
    public static readonly Person IvanAgent = new("Иван Петров", "ivan.petrov@polisgo.test", UserRole.Agent, "иван");
    public static readonly Person LeylaAgent = new("Leyla Agent Eisgum", "leyla.agent@polisgo.test", UserRole.Agent, "leyla");
    public static readonly Person IlqarAdjuster =
        new("Ilqar Ismayılov", "ilqar.adj@polisgo.test", UserRole.Adjuster, "ılqar", "ismayılov");
    public static readonly Person OlgaAdjuster = new("Ольга Смирнова", "olga.s@polisgo.test", UserRole.Adjuster);

    public static readonly Person[] Staff = [Admin, IbrahimAdmin, IbrahimAgent, IvanAgent, LeylaAgent, IlqarAdjuster, OlgaAdjuster];

    public static readonly Person[] Clients =
    [
        new("Leyla Məmmədova Mwmdctcgagnee", "leyla.m@polisgo.test", UserRole.Client, "leyla", "məmmədova"),
        new("IBRAHIM BABAYEV", "babayev.i@polisgo.test", UserRole.Client, "ibrahim"),
        new("Фёдор Ёлкин", "fedor@polisgo.test", UserRole.Client, "елкин"),
        new("Gülnar İsmayılova", "gulnar@polisgo.test", UserRole.Client, "ismayılov"),
        new("Ləman Quliyeva", "laman.q@polisgo.test", UserRole.Client),
        new("Анна Кузнецова", "anna.k@polisgo.test", UserRole.Client),
        new("John Carter", "john.carter@polisgo.test", UserRole.Client),
        new("Aysel Hasanova", "aysel@polisgo.test", UserRole.Client),
        new("Rauf Əliyev", "rauf.aliyev@polisgo.test", UserRole.Client),
        new("Мария Иванова", "maria.i@polisgo.test", UserRole.Client, "иван"),
    ];

    public List<Event> Events { get; } = [];

    public IEnumerable<Event> Expected(string term) =>
        Events.Where(e => e.Involves.Any(p => p.Matches(term)));

    public static AuditSearchDataSet Seed(AppDbContext db)
    {
        var set = new AuditSearchDataSet();
        var random = new Random(20261124);
        var start = new DateTime(2026, 1, 5, 6, 0, 0, DateTimeKind.Utc);
        var seconds = 0;
        DateTime Next() => start.AddSeconds(seconds += random.Next(60, 3_600));

        foreach (var person in Staff.Concat(Clients))
        {
            db.Users.Add(new User
            {
                Id = person.Id, Email = person.Email, FullName = person.Name, PasswordHash = "n/a",
                Role = person.Role!.Value, CreatedAt = start
            });
        }
        var customers = new Dictionary<Person, Customer>();
        foreach (var person in Clients)
        {
            var customer = new Customer
            {
                Id = Guid.NewGuid(), UserId = person.Id, FullName = person.Name, Email = person.Email,
                Phone = "+994501234567", BirthDate = new DateTime(1990, 1, 1), DrivingLicenseDate = new DateTime(2010, 1, 1),
                CreatedAt = start
            };
            customers[person] = customer;
            db.Customers.Add(customer);
        }
        db.SaveChanges();

        // Staff accounts created by the admin: subject = the account's email.
        foreach (var member in Staff.Skip(1))
        {
            var at = Next();
            var id = Guid.NewGuid();
            db.AuditEntries.Add(new AuditEntry
            {
                Id = id, OccurredAt = at, ActorUserId = Admin.Id, Action = AuditAction.StaffCreated,
                SubjectId = member.Id, SubjectLabel = member.Email, ToValue = member.Role.ToString()
            });
            set.Events.Add(new Event(id, at, [Admin, member]));
        }

        // Policies, each issued (Draft) and paid (Active) by its customer or
        // an agent, and some cancelled by an admin; claims on some of them.
        var agents = Staff.Where(p => p.Role == UserRole.Agent).ToArray();
        var adjusters = Staff.Where(p => p.Role == UserRole.Adjuster).ToArray();
        var admins = Staff.Where(p => p.Role == UserRole.Admin).ToArray();
        var policyNumber = 0;
        var claimNumber = 0;
        while (set.Events.Count < 1_400)
        {
            var client = Clients[random.Next(Clients.Length)];
            var customer = customers[client];
            var vehicle = new Vehicle
            {
                Id = Guid.NewGuid(), CustomerId = customer.Id, Make = "Toyota", Model = "Corolla", Year = 2019,
                EngineCapacityCc = 1800, PlateNumber = $"90-DS-{policyNumber:000}", Vin = $"DSVIN{policyNumber:000000000000}"
            };
            var issuedAt = Next();
            var policy = new Policy
            {
                Id = Guid.NewGuid(), PolicyNumber = $"PG-DS-{++policyNumber:00000}", CustomerId = customer.Id,
                VehicleId = vehicle.Id, PolicyTypeId = PolicyTypeConfiguration.MtplId, StartDate = issuedAt.Date.AddDays(1),
                EndDate = issuedAt.Date.AddYears(1), Premium = 100m, Status = PolicyStatus.Active, CreatedAt = issuedAt
            };
            db.Vehicles.Add(vehicle);
            db.Policies.Add(policy);
            var seller = random.Next(3) == 0 ? agents[random.Next(agents.Length)] : client;
            AddPolicyEvent(db, set, policy, client, seller, null, PolicyStatus.Draft, issuedAt);
            AddPolicyEvent(db, set, policy, client, seller, PolicyStatus.Draft, PolicyStatus.Active, Next());
            if (random.Next(6) == 0)
            {
                AddPolicyEvent(db, set, policy, client, admins[random.Next(admins.Length)],
                    PolicyStatus.Active, PolicyStatus.Cancelled, Next());
            }

            if (random.Next(2) == 0)
            {
                var adjuster = adjusters[random.Next(adjusters.Length)];
                var claim = new Claim
                {
                    Id = Guid.NewGuid(), ClaimNumber = $"CLM-DS-{++claimNumber:00000}", PolicyId = policy.Id,
                    IncidentDate = issuedAt.AddDays(3), Description = "Rear bumper damaged.", ClaimedAmount = 300m,
                    Status = ClaimStatus.UnderReview, AssignedAdjusterId = adjuster.Id, CreatedAt = issuedAt.AddDays(3)
                };
                db.Claims.Add(claim);
                AddClaimEvent(db, set, claim, client, client, null, ClaimStatus.Submitted, Next());
                AddClaimEvent(db, set, claim, client, adjuster, ClaimStatus.Submitted, ClaimStatus.UnderReview, Next());
            }
        }
        db.SaveChanges();

        // Customers moved between agents: subject = the customer's name, the
        // values name the agents. The bulk of a test-run database.
        var current = Clients.ToDictionary(c => c, _ => (Person?)null);
        while (set.Events.Count < TotalEvents)
        {
            var client = Clients[random.Next(Clients.Length)];
            var from = current[client];
            var to = random.Next(5) == 0 ? null : agents[random.Next(agents.Length)];
            if (from == to) continue;
            var actor = admins[random.Next(admins.Length)];
            var at = Next();
            var id = Guid.NewGuid();
            db.AuditEntries.Add(new AuditEntry
            {
                Id = id, OccurredAt = at, ActorUserId = actor.Id, Action = AuditAction.CustomerAssigned,
                SubjectId = customers[client].Id, SubjectLabel = client.Name, FromValue = from?.Name, ToValue = to?.Name
            });
            set.Events.Add(new Event(id, at, new[] { actor, client, from, to }.OfType<Person>().ToArray()));
            current[client] = to;
        }
        db.SaveChanges();
        return set;
    }

    private static void AddPolicyEvent(AppDbContext db, AuditSearchDataSet set, Policy policy, Person client, Person actor,
        PolicyStatus? from, PolicyStatus to, DateTime at)
    {
        var id = Guid.NewGuid();
        db.PolicyStatusHistory.Add(new PolicyStatusHistory
        {
            Id = id, PolicyId = policy.Id, FromStatus = from, ToStatus = to, ChangedByUserId = actor.Id, ChangedAt = at
        });
        set.Events.Add(new Event(id, at, [actor, client]));
    }

    private static void AddClaimEvent(AppDbContext db, AuditSearchDataSet set, Claim claim, Person client, Person actor,
        ClaimStatus? from, ClaimStatus to, DateTime at)
    {
        var id = Guid.NewGuid();
        db.ClaimStatusHistory.Add(new ClaimStatusHistory
        {
            Id = id, ClaimId = claim.Id, FromStatus = from, ToStatus = to, ChangedByUserId = actor.Id, Comment = "",
            ChangedAt = at
        });
        set.Events.Add(new Event(id, at, [actor, client]));
    }
}
