using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Infrastructure.Persistence.Configurations;

namespace PolisGo.Tests.Search;

// People whose names need a real case fold: Azerbaijani I/İ/ı, Ə/ə, Ş, Ç, Ğ,
// Ö, Ü, Cyrillic with ё, and Latin. Each one is a customer with a vehicle, a
// policy and a claim, and a staff member of the same name; three error groups
// are titled in three languages. Every search lists, by hand, whom it finds:
// the expectations never call SearchText, so they can't share its mistakes.
internal sealed class SearchFoldDataSet
{
    public sealed record Person(string Tag, string FullName, string Email, string Letters);

    public static readonly Person[] People =
    [
        new("ibrahim", "İbrahim Şirinov", "i.shirinov@mail.az", "IB"),
        new("ilqar", "ILQAR ÇƏLƏBİ", "ilqar.c@mail.az", "IC"),
        new("gulnare", "Gülnarə Ağayeva", "gulnare.a@mail.az", "GA"),
        new("omer", "Ömər Əliyev", "omer.e@mail.az", "OE"),
        new("rauf", "Rauf Aliyev", "rauf.a@mail.az", "RA"),
        new("ulviyye", "Ülviyyə Hacıyeva", "ulviyye.h@mail.az", "UH"),
        new("olga", "Ольга Иванова", "olga.i@mail.ru", "OI"),
        new("alena", "Алёна Ковалёва", "alena.k@mail.ru", "AK"),
        new("john", "John Smith", "john.s@mail.com", "JS"),
    ];

    // Typed text → the people it must find, in customers, policies, claims
    // and the staff list alike.
    public static TheoryData<string, string[]> PeopleSearches => new()
    {
        { "ibrahim", ["ibrahim"] },
        { "IBRAHIM", ["ibrahim"] },          // Latin capital I
        { "İBRAHİM", ["ibrahim"] },          // Azerbaijani dotted capitals
        { "ıbrahım", ["ibrahim"] },          // dotless ı typed
        { "ŞİRİNOV", ["ibrahim"] },
        { "ılqar", ["ilqar"] },              // stored in capitals
        { "çələbi", ["ilqar"] },
        { "AĞAYEVA", ["gulnare"] },
        { "gülnarə", ["gulnare"] },
        { "ÖMƏR", ["omer"] },
        { "ƏLİYEV", ["omer"] },              // ə is not a: never "Aliyev"
        { "aliyev", ["rauf"] },
        { "HACIYEVA", ["ulviyye"] },         // I typed for ı
        { "ülviyyə", ["ulviyye"] },
        { "ОЛЬГА", ["olga"] },
        { "иванова", ["olga"] },
        { "алена", ["alena"] },              // е finds ё
        { "КОВАЛЁВА", ["alena"] },
        { "SMITH", ["john"] },
        { "i.SHIRINOV@", ["ibrahim"] },      // email
        { "yev", ["gulnare", "omer", "rauf", "ulviyye"] },
        { "MAIL.RU", ["olga", "alena"] },
        { "zzz", [] },
    };

    // An agent's book: these customers only.
    public static readonly string[] Book = ["ibrahim", "olga", "rauf"];

    public static TheoryData<string, string[]> BookSearches => new()
    {
        { "yev", ["rauf"] },
        { "ОЛЬГА", ["olga"] },
        { "İBRAHİM", ["ibrahim"] },
        { "ağayeva", [] },                   // a customer, but not in the book
    };

    public sealed record ErrorTitle(string Tag, ErrorSource Source, string Title, string Type, string Endpoint);

    public static readonly ErrorTitle[] Errors =
    [
        new("ru", ErrorSource.Frontend, "Не удалось загрузить модуль", "TypeError", "/app/claims/:id"),
        new("az", ErrorSource.Frontend, "Şəkil yüklənmədi: ÖDƏNİŞ", "Error", "/app/policies/:id"),
        new("en", ErrorSource.Backend, "Payment failed", "System.InvalidOperationException", "POST api/policies/{id}/pay"),
    ];

    public static TheoryData<string, string[]> ErrorSearches => new()
    {
        { "НЕ УДАЛОСЬ", ["ru"] },
        { "загрузить", ["ru"] },
        { "ŞƏKİL", ["az"] },
        { "YÜKLƏNMƏDİ", ["az"] },
        { "ödəniş", ["az"] },
        { "PAYMENT", ["en"] },
        { "typeerror", ["ru"] },             // the type
        { "/APP/", ["ru", "az"] },           // the endpoint
        { "zzz", [] },
    };

    public required Guid BookAgentId { get; init; }
    public required IReadOnlyDictionary<Guid, string> CustomerTags { get; init; }
    public required IReadOnlyDictionary<Guid, string> PolicyTags { get; init; }
    public required IReadOnlyDictionary<Guid, string> ClaimTags { get; init; }
    public required IReadOnlyDictionary<Guid, string> StaffTags { get; init; }
    public required IReadOnlyDictionary<Guid, string> ErrorTags { get; init; }

    public static string PolicyNumber(int i) => $"PG-2026-SF{i:000}";
    public static string ClaimNumber(int i) => $"CL-2026-SF{i:000}";
    public static string Plate(int i) => $"77-{People[i].Letters}-{i:000}";

    public static SearchFoldDataSet Seed(AppDbContext db)
    {
        var created = new DateTime(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc);
        var agent = Staff(db, "Book Agent", "book.agent@polisgo.test", UserRole.Agent, created);
        var staff = new Dictionary<Guid, string>();
        var customers = new Dictionary<Guid, string>();
        var policies = new Dictionary<Guid, string>();
        var claims = new Dictionary<Guid, string>();

        for (var i = 0; i < People.Length; i++)
        {
            var person = People[i];
            var at = created.AddMinutes(i);
            staff[Staff(db, person.FullName, "staff." + person.Email, UserRole.Agent, at).Id] = person.Tag;

            var inBook = Book.Contains(person.Tag);
            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                FullName = person.FullName,
                Email = person.Email,
                Phone = $"+994 50 700 00 {i:00}",
                BirthDate = new DateTime(1990, 5, 1),
                DrivingLicenseDate = new DateTime(2010, 6, 1),
                AgentId = inBook ? agent.Id : null,
                CreatedAt = at,
            };
            var vehicle = new Vehicle
            {
                Id = Guid.NewGuid(),
                CustomerId = customer.Id,
                Make = "Toyota",
                Model = "Corolla",
                Year = 2019,
                EngineCapacityCc = 1800,
                PlateNumber = Plate(i),
                Vin = $"VINSF{i:000000000000}",
            };
            var policy = new Policy
            {
                Id = Guid.NewGuid(),
                PolicyNumber = PolicyNumber(i),
                CustomerId = customer.Id,
                VehicleId = vehicle.Id,
                PolicyTypeId = PolicyTypeConfiguration.MtplId,
                AgentId = inBook ? agent.Id : null,
                StartDate = new DateTime(2026, 11, 2),
                EndDate = new DateTime(2027, 11, 1),
                Premium = 100m,
                Status = PolicyStatus.Active,
                CreatedAt = at,
            };
            var claim = new Claim
            {
                Id = Guid.NewGuid(),
                ClaimNumber = ClaimNumber(i),
                PolicyId = policy.Id,
                IncidentDate = new DateTime(2026, 11, 10),
                Description = "Rear bumper damaged in a parking lot.",
                ClaimedAmount = 500m,
                Status = ClaimStatus.Submitted,
                CreatedAt = at.AddDays(10),
            };
            db.AddRange(customer, vehicle, policy, claim);
            customers[customer.Id] = person.Tag;
            policies[policy.Id] = person.Tag;
            claims[claim.Id] = person.Tag;
        }

        var errors = new Dictionary<Guid, string>();
        for (var i = 0; i < Errors.Length; i++)
        {
            var error = Errors[i];
            var group = new ErrorGroup
            {
                Id = Guid.NewGuid(),
                Fingerprint = $"search-fold-{error.Tag}",
                Source = error.Source,
                Title = error.Title,
                ExceptionType = error.Type,
                Endpoint = error.Endpoint,
                FirstSeenAt = created.AddHours(i),
                LastSeenAt = created.AddHours(i),
                OccurrenceCount = 1,
            };
            db.ErrorGroups.Add(group);
            errors[group.Id] = error.Tag;
        }

        db.SaveChanges();
        db.ChangeTracker.Clear();
        return new SearchFoldDataSet
        {
            BookAgentId = agent.Id,
            CustomerTags = customers,
            PolicyTags = policies,
            ClaimTags = claims,
            StaffTags = staff,
            ErrorTags = errors,
        };
    }

    private static User Staff(AppDbContext db, string name, string email, UserRole role, DateTime at)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = "n/a",
            FullName = name,
            Role = role,
            CreatedAt = at,
        };
        db.Users.Add(user);
        return user;
    }
}
