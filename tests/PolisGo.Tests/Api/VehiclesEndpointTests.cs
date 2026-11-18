using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using PolisGo.Application.Vehicles;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

public class VehiclesEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public VehiclesEndpointTests(ApiFactory factory) => _factory = factory;

    private static object Vehicle(string plate, string vin = "1HGBH41JXMN109186", string make = "Toyota",
        int year = 2020, int engineCc = 1800) => new
    {
        make,
        model = "Corolla",
        year,
        engineCapacityCc = engineCc,
        plateNumber = plate,
        vin
    };

    private static string UniquePlate() => $"77-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

    [Fact]
    public async Task Anonymous_gets_401()
    {
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/vehicles")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/vehicles", Vehicle(UniquePlate()))).StatusCode);
    }

    [Fact]
    public async Task Client_registers_a_vehicle_with_normalised_plate()
    {
        var client = _factory.ClientAs(UserRole.Client, out var customerId);
        var plate = UniquePlate();

        var response = await client.PostAsJsonAsync("/api/vehicles",
            Vehicle(plate.ToLowerInvariant(), vin: "1hgbh41jxmn109186"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(plate, body.GetProperty("plateNumber").GetString());
        Assert.Equal("1HGBH41JXMN109186", body.GetProperty("vin").GetString());
        Assert.Equal(customerId, body.GetProperty("customerId").GetGuid());
    }

    // Reproduces the bug: these passed validation and only failed at the
    // database (a 500 on SQL Server; SQLite accepted them silently).
    [Fact]
    public async Task Over_long_or_malformed_fields_are_a_400_per_field()
    {
        var client = _factory.ClientAs(UserRole.Client);

        var response = await client.PostAsJsonAsync("/api/vehicles", Vehicle(
            plate: "THIS-PLATE-IS-FAR-TOO-LONG",
            vin: "VIN-WITH-O-AND-Q-TOO-LONG",
            make: new string('m', 65),
            year: 1900,
            engineCc: 50_000));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        var errors = problem.GetProperty("errors");
        Assert.Equal(VehicleValidation.Messages.PlateInvalid, errors.GetProperty("PlateNumber")[0].GetString());
        Assert.Equal(VehicleValidation.Messages.VinInvalid, errors.GetProperty("Vin")[0].GetString());
        Assert.Equal(VehicleValidation.Messages.MakeTooLong, errors.GetProperty("Make")[0].GetString());
        Assert.Equal(VehicleValidation.Messages.YearOutOfRange, errors.GetProperty("Year")[0].GetString());
        Assert.Equal(VehicleValidation.Messages.EngineCapacityTooLarge, errors.GetProperty("EngineCapacityCc")[0].GetString());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task A_duplicate_plate_is_a_409_problem()
    {
        var client = _factory.ClientAs(UserRole.Client);
        var plate = UniquePlate();
        (await client.PostAsJsonAsync("/api/vehicles", Vehicle(plate))).EnsureSuccessStatusCode();

        var response = await _factory.ClientAs(UserRole.Client).PostAsJsonAsync("/api/vehicles", Vehicle(plate));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Staff_registering_for_an_unknown_customer_gets_404()
    {
        var response = await _factory.ClientAs(UserRole.Agent).PostAsJsonAsync("/api/vehicles", new
        {
            make = "Kia",
            model = "Rio",
            year = 2021,
            engineCapacityCc = 1400,
            plateNumber = UniquePlate(),
            vin = "1HGBH41JXMN109186",
            customerId = Guid.NewGuid()
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
