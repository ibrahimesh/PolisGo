using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Persistence;
using Xunit;

namespace PolisGo.Tests.Auth;

public class AuthServiceTests
{
    // Each test spins up its own InMemory database so they don't interfere.
    private static AppDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(
                Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    private static AuthService NewSut(AppDbContext db)
    {
        var jwt = Options.Create(new JwtSettings
        {
            Issuer = "test-issuer",
            Audience = "test-audience",
            // 32+ chars so JwtSettingsValidator-equivalent constraints are satisfied.
            SecretKey = "this-is-a-very-long-test-secret-key-32chars",
            ExpiryMinutes = 60
        });
        return new AuthService(db, new BcryptPasswordHasher(), new JwtTokenGenerator(jwt));
    }

    private static RegisterRequest ValidRegister(string? email = null) => new(
        Email: email ?? $"client{Guid.NewGuid():N}@example.com",
        Password: "Secret12345",
        FullName: "Test Client",
        Phone: "+994501234567",
        BirthDate: new DateTime(1990, 1, 1),
        DrivingLicenseDate: new DateTime(2010, 1, 1)
    );

    [Fact]
    public async Task Register_ValidRequest_PersistsUserAndCustomerAndReturnsToken()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        var request = ValidRegister("new.user@example.com");

        var response = await sut.RegisterAsync(request);

        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.Equal("new.user@example.com", response.Email);
        Assert.Equal(UserRole.Client, response.Role);
        Assert.True(response.ExpiresAt > DateTime.UtcNow);

        Assert.Single(db.Users);
        var customer = Assert.Single(db.Customers);
        Assert.NotNull(customer.UserId);
    }

    [Fact]
    public async Task Register_DuplicateEmail_ThrowsConflict()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        var request = ValidRegister("dup@example.com");
        await sut.RegisterAsync(request);

        await Assert.ThrowsAsync<ConflictException>(() => sut.RegisterAsync(request));
    }

    [Fact]
    public async Task Register_WeakPassword_ThrowsValidation()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        var request = ValidRegister() with { Password = "short" };

        var ex = await Assert.ThrowsAsync<ValidationException>(() => sut.RegisterAsync(request));
        Assert.Contains("Password", ex.Errors.Keys);
    }

    [Fact]
    public async Task Register_SelfRegistrationAlwaysProducesClientRole()
    {
        await using var db = NewDb();
        var sut = NewSut(db);

        var response = await sut.RegisterAsync(ValidRegister("role-check@example.com"));

        Assert.Equal(UserRole.Client, response.Role);
        var persisted = await db.Users.SingleAsync();
        Assert.Equal(UserRole.Client, persisted.Role);
    }

    [Fact]
    public async Task Login_ValidCredentials_ReturnsToken()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        await sut.RegisterAsync(ValidRegister("login-ok@example.com"));

        var response = await sut.LoginAsync(new LoginRequest("login-ok@example.com", "Secret12345"));

        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.Equal("login-ok@example.com", response.Email);
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorized()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        await sut.RegisterAsync(ValidRegister("bad-pw@example.com"));

        await Assert.ThrowsAsync<PolisGo.Application.Common.Exceptions.UnauthorizedException>(
            () => sut.LoginAsync(new LoginRequest("bad-pw@example.com", "WrongPass9")));
    }

    [Fact]
    public async Task Register_StoresPhoneInE164_WhateverFormatWasSent()
    {
        await using var db = NewDb();
        var sut = NewSut(db);

        await sut.RegisterAsync(ValidRegister() with { Phone = "050-123-45-67" });

        Assert.Equal("+994501234567", Assert.Single(db.Customers).Phone);
    }

    [Fact]
    public async Task Register_ReportsEveryInvalidFieldAtOnce_AndPersistsNothing()
    {
        await using var db = NewDb();
        var sut = NewSut(db);
        var request = ValidRegister() with
        {
            Email = "user@polisgo",
            Password = "password1",
            FullName = "x",
            Phone = "1",
            BirthDate = DateTime.UtcNow.Date.AddYears(-10)
        };

        var ex = await Assert.ThrowsAsync<ValidationException>(() => sut.RegisterAsync(request));

        Assert.Equal(
            new[] { "BirthDate", "Email", "FullName", "Password", "Phone" },
            ex.Errors.Keys.Order());
        Assert.Equal(AuthValidation.Messages.Underage, ex.Errors["BirthDate"][0]);
        Assert.Equal(AuthValidation.Messages.PhoneInvalid, ex.Errors["Phone"][0]);
        Assert.Empty(db.Users);
        Assert.Empty(db.Customers);
    }

    [Fact]
    public async Task Register_LicenceBefore18_IsRejected()
    {
        await using var db = NewDb();
        var sut = NewSut(db);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => sut.RegisterAsync(
            ValidRegister() with { DrivingLicenseDate = new DateTime(2005, 1, 1) }));

        Assert.Equal(AuthValidation.Messages.LicenceBefore18, Assert.Single(ex.Errors).Value[0]);
    }

    [Fact]
    public async Task CreateStaff_AppliesTheSamePasswordAndNameRules()
    {
        await using var db = NewDb();
        var sut = NewSut(db);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => sut.CreateStaffUserAsync(
            new CreateStaffUserRequest("agent@polisgo.az", "weakpass1", "A", UserRole.Agent)));

        Assert.Equal(new[] { "FullName", "Password" }, ex.Errors.Keys.Order());
        Assert.Empty(db.Users);
    }

    [Fact]
    public async Task Login_StillAcceptsAccountsCreatedUnderOlderRules()
    {
        // Seed directly: this password doesn't meet today's policy.
        await using var db = NewDb();
        var hasher = new BcryptPasswordHasher();
        db.Users.Add(new PolisGo.Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Email = "legacy@example.com",
            PasswordHash = hasher.Hash("legacypass1"),
            FullName = "Legacy User",
            Role = UserRole.Client,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var response = await NewSut(db).LoginAsync(new LoginRequest("legacy@example.com", "legacypass1"));

        Assert.False(string.IsNullOrWhiteSpace(response.Token));
    }

    [Fact]
    public async Task Login_UnknownEmail_ThrowsUnauthorized()
    {
        await using var db = NewDb();
        var sut = NewSut(db);

        await Assert.ThrowsAsync<PolisGo.Application.Common.Exceptions.UnauthorizedException>(
            () => sut.LoginAsync(new LoginRequest("ghost@example.com", "Secret12345")));
    }
}
