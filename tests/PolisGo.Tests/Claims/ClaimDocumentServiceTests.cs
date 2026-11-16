using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Tests.Infrastructure;
using Xunit;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Tests.Claims;

public class ClaimDocumentServiceTests
{
    private static byte[] PdfBytes()
    {
        // Valid PDF header + minimal filler so the stream has length > 0.
        var pdf = new byte[32];
        pdf[0] = 0x25; pdf[1] = 0x50; pdf[2] = 0x44; pdf[3] = 0x46;
        return pdf;
    }

    private static byte[] PngBytes()
    {
        var png = new byte[32];
        png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
        png[4] = 0x0D; png[5] = 0x0A; png[6] = 0x1A; png[7] = 0x0A;
        return png;
    }

    private static Guid SeedSubmittedClaim(AppDbContext db, Guid userId, Guid customerId)
    {
        var user = db.Users.Find(userId) ?? new User
        {
            Id = userId, Email = "c@example.com", PasswordHash = "n/a", FullName = "c",
            Role = UserRole.Client, CreatedAt = DateTime.UtcNow
        };
        if (db.Users.Find(userId) is null) db.Users.Add(user);

        var customer = new Customer
        {
            Id = customerId, UserId = user.Id, FullName = "c", Email = "c@example.com",
            Phone = "+994501111111", BirthDate = DateTime.UtcNow.AddYears(-30).Date,
            DrivingLicenseDate = DateTime.UtcNow.AddYears(-10).Date,
            CreatedAt = DateTime.UtcNow
        };
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(), CustomerId = customer.Id, Make = "A", Model = "B",
            Year = 2020, EngineCapacityCc = 1800,
            PlateNumber = $"P{Guid.NewGuid():N}"[..8], Vin = $"V{Guid.NewGuid():N}"[..17]
        };
        var policyType = db.PolicyTypes.First(pt => pt.Code == "MTPL");
        var policy = new Policy
        {
            Id = Guid.NewGuid(),
            PolicyNumber = $"PG-2026-{Guid.NewGuid():N}"[..16].ToUpperInvariant(),
            CustomerId = customer.Id, VehicleId = vehicle.Id, PolicyTypeId = policyType.Id,
            StartDate = DateTime.UtcNow.AddMonths(-1), EndDate = DateTime.UtcNow.AddMonths(11),
            Premium = 100m, Status = PolicyStatus.Active, CreatedAt = DateTime.UtcNow
        };
        var claim = new DomainClaim
        {
            Id = Guid.NewGuid(),
            ClaimNumber = $"CL-2026-{Guid.NewGuid():N}"[..16].ToUpperInvariant(),
            PolicyId = policy.Id, IncidentDate = DateTime.UtcNow.AddDays(-5),
            Description = "Something happened", ClaimedAmount = 500m,
            Status = ClaimStatus.Submitted, CreatedAt = DateTime.UtcNow
        };
        db.Customers.Add(customer);
        db.Vehicles.Add(vehicle);
        db.Policies.Add(policy);
        db.Claims.Add(claim);
        db.SaveChanges();
        return claim.Id;
    }

    private static ClaimDocumentService NewSut(
        AppDbContext db, Guid userId, Guid customerId, IFileStorage storage)
    {
        var currentUser = new FakeCurrentUser
        {
            UserId = userId, Role = UserRole.Client, CustomerId = customerId
        };
        return new ClaimDocumentService(db, currentUser, storage);
    }

    [Fact]
    public async Task Upload_ValidPdf_CreatesDocumentRow()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var storage = new InMemoryFileStorage();
        var sut = NewSut(fixture.Db, userId, customerId, storage);

        using var pdf = new MemoryStream(PdfBytes());
        var response = await sut.UploadAsync(claimId, pdf, "evidence.pdf", pdf.Length);

        Assert.Equal("evidence.pdf", response.FileName);
        Assert.Equal(1, await fixture.Db.ClaimDocuments.CountAsync());
        Assert.Single(storage.SavedKeys);
    }

    [Fact]
    public async Task Upload_BadExtension_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var sut = NewSut(fixture.Db, userId, customerId, new InMemoryFileStorage());

        using var exe = new MemoryStream(new byte[] { 0x4D, 0x5A, 0x90, 0x00 });
        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.UploadAsync(claimId, exe, "trojan.exe", exe.Length));
    }

    [Fact]
    public async Task Upload_PdfExtensionWithWrongMagicBytes_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var sut = NewSut(fixture.Db, userId, customerId, new InMemoryFileStorage());

        // Not a PDF: random bytes with .pdf extension.
        using var fake = new MemoryStream(new byte[] { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00, 0x00, 0x00 });
        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.UploadAsync(claimId, fake, "sneaky.pdf", fake.Length));
    }

    [Fact]
    public async Task Upload_OverFiveMegabytes_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var sut = NewSut(fixture.Db, userId, customerId, new InMemoryFileStorage());

        using var big = new MemoryStream(new byte[6 * 1024 * 1024]);
        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.UploadAsync(claimId, big, "big.pdf", big.Length));
    }

    [Fact]
    public async Task Upload_OverTenDocuments_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var sut = NewSut(fixture.Db, userId, customerId, new InMemoryFileStorage());

        for (var i = 0; i < 10; i++)
        {
            using var pdf = new MemoryStream(PdfBytes());
            await sut.UploadAsync(claimId, pdf, $"file{i}.pdf", pdf.Length);
        }

        using var eleventh = new MemoryStream(PdfBytes());
        await Assert.ThrowsAsync<ConflictException>(() =>
            sut.UploadAsync(claimId, eleventh, "eleven.pdf", eleventh.Length));
    }

    [Fact]
    public async Task Upload_PathTraversalFileName_StoredAsLeafName()
    {
        using var fixture = new SqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var sut = NewSut(fixture.Db, userId, customerId, new InMemoryFileStorage());

        using var pdf = new MemoryStream(PdfBytes());
        var response = await sut.UploadAsync(claimId, pdf, @"..\..\etc\passwd.pdf", pdf.Length);
        Assert.Equal("passwd.pdf", response.FileName);
    }

    [Fact]
    public async Task Upload_DbFails_FileOnDiskIsCleanedUp()
    {
        using var fixture = new FailingSqliteTestDb();
        var userId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var claimId = SeedSubmittedClaim(fixture.Db, userId, customerId);
        var storage = new InMemoryFileStorage();
        var currentUser = new FakeCurrentUser
        {
            UserId = userId, Role = UserRole.Client, CustomerId = customerId
        };
        var sut = new ClaimDocumentService(fixture.Db, currentUser, storage);

        // Flip after the LoadVisibleAsync/count queries complete inside UploadAsync
        // so only the final SaveChanges fails. We arm the flag by subscribing to
        // the storage's SavedKeys growing — when a file lands, flip the switch.
        storage.OnSaved = _ => fixture.Db.FailOnSave = true;

        using var pdf = new MemoryStream(PdfBytes());
        await Assert.ThrowsAsync<DbUpdateException>(() =>
            sut.UploadAsync(claimId, pdf, "evidence.pdf", pdf.Length));

        // File was saved then deleted — orphan cleanup worked.
        Assert.Single(storage.SavedKeys);
        Assert.Single(storage.DeletedKeys);
        Assert.Equal(storage.SavedKeys[0], storage.DeletedKeys[0]);
    }

    // ---------- Test helpers ----------

    private sealed class InMemoryFileStorage : IFileStorage
    {
        public List<string> SavedKeys { get; } = new();
        public List<string> DeletedKeys { get; } = new();
        public Action<string>? OnSaved { get; set; }
        private readonly Dictionary<string, byte[]> _blobs = new();

        public async Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken = default)
        {
            using var ms = new MemoryStream();
            await content.CopyToAsync(ms, cancellationToken);
            var key = $"{Guid.NewGuid():N}{extension}";
            _blobs[key] = ms.ToArray();
            SavedKeys.Add(key);
            OnSaved?.Invoke(key);
            return key;
        }

        public Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default)
            => Task.FromResult<Stream>(new MemoryStream(_blobs[storageKey]));

        public Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            DeletedKeys.Add(storageKey);
            _blobs.Remove(storageKey);
            return Task.CompletedTask;
        }
    }

    // Subclass that flips to failure on demand so we can exercise the orphan
    // cleanup path without racing an actual DB error.
    private sealed class FailingAppDbContext : AppDbContext
    {
        public bool FailOnSave { get; set; }
        public FailingAppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            if (FailOnSave)
            {
                throw new DbUpdateException("Simulated save failure",
                    new InvalidOperationException("simulated"));
            }
            return base.SaveChangesAsync(cancellationToken);
        }
    }

    private sealed class FailingSqliteTestDb : IDisposable
    {
        public FailingAppDbContext Db { get; }
        private readonly SqliteConnection _connection;

        public FailingSqliteTestDb()
        {
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options;
            Db = new FailingAppDbContext(options);
            Db.Database.EnsureCreated();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }
}
