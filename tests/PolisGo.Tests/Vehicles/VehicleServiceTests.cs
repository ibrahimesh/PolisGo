using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Vehicles;
using PolisGo.Application.Vehicles.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;
using Xunit;

namespace PolisGo.Tests.Vehicles;

public class VehicleServiceTests
{
    private static Guid SeedCustomer(Infrastructure.SqliteTestDb fixture, string email = "c@example.com")
    {
        var user = new User
        {
            Id = Guid.NewGuid(), Email = email, PasswordHash = "n/a", FullName = "Test",
            Role = UserRole.Client, CreatedAt = DateTime.UtcNow
        };
        var customer = new Customer
        {
            Id = Guid.NewGuid(), UserId = user.Id, FullName = "Test",
            Email = email, Phone = "+994501111111",
            BirthDate = DateTime.UtcNow.AddYears(-30).Date,
            DrivingLicenseDate = DateTime.UtcNow.AddYears(-10).Date,
            CreatedAt = DateTime.UtcNow
        };
        fixture.Db.Users.Add(user);
        fixture.Db.Customers.Add(customer);
        fixture.Db.SaveChanges();
        return customer.Id;
    }

    private static CreateVehicleRequest ValidRequest(Guid? customerId = null, string plate = "ABC-100") =>
        new("Toyota", "Corolla", 2020, 1800, plate, "1HGBH41JXMN109186", customerId);

    [Fact]
    public async Task Create_AsClient_IgnoresCustomerIdInBodyUsesToken()
    {
        using var fixture = new SqliteTestDb();
        var myCustomer = SeedCustomer(fixture, "me@example.com");
        var otherCustomer = SeedCustomer(fixture, "other@example.com");
        var user = fixture.Db.Users.First().Id;

        var sut = new VehicleService(fixture.Db, new FakeCurrentUser
        {
            UserId = user, Role = UserRole.Client, CustomerId = myCustomer
        });

        // Body tries to sneak in another customer's id — service must ignore it.
        var response = await sut.CreateAsync(ValidRequest(customerId: otherCustomer, plate: "MINE-01"));
        Assert.Equal(myCustomer, response.CustomerId);
    }

    [Fact]
    public async Task Create_AsAgent_RequiresCustomerId()
    {
        using var fixture = new SqliteTestDb();
        var sut = new VehicleService(fixture.Db, new FakeCurrentUser
        {
            UserId = Guid.NewGuid(), Role = UserRole.Agent, CustomerId = null
        });

        await Assert.ThrowsAsync<ValidationException>(() =>
            sut.CreateAsync(ValidRequest(customerId: null)));
    }

    [Fact]
    public async Task Create_DuplicatePlate_Rejected()
    {
        using var fixture = new SqliteTestDb();
        var customerId = SeedCustomer(fixture);
        var user = fixture.Db.Users.First().Id;
        var sut = new VehicleService(fixture.Db, new FakeCurrentUser
        {
            UserId = user, Role = UserRole.Client, CustomerId = customerId
        });

        await sut.CreateAsync(ValidRequest(plate: "DUP-001"));

        await Assert.ThrowsAsync<ConflictException>(() =>
            sut.CreateAsync(ValidRequest(plate: "dup-001")));
    }

    [Fact]
    public async Task List_AsClient_ReturnsOnlyOwnVehicles()
    {
        using var fixture = new SqliteTestDb();
        var mine = SeedCustomer(fixture, "me@example.com");
        var other = SeedCustomer(fixture, "other@example.com");
        var myUserId = fixture.Db.Users.First(u => u.Email == "me@example.com").Id;
        var otherUserId = fixture.Db.Users.First(u => u.Email == "other@example.com").Id;

        await new VehicleService(fixture.Db,
                new FakeCurrentUser { UserId = myUserId, Role = UserRole.Client, CustomerId = mine })
            .CreateAsync(ValidRequest(plate: "MINE-1"));
        await new VehicleService(fixture.Db,
                new FakeCurrentUser { UserId = otherUserId, Role = UserRole.Client, CustomerId = other })
            .CreateAsync(ValidRequest(plate: "OTHR-1"));

        var mine_list = await new VehicleService(fixture.Db,
                new FakeCurrentUser { UserId = myUserId, Role = UserRole.Client, CustomerId = mine })
            .ListAsync(customerId: null);

        Assert.Single(mine_list);
        Assert.Equal("MINE-1", mine_list[0].PlateNumber);
    }
}
