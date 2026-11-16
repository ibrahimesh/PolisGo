namespace PolisGo.Application.Vehicles.Dtos;

public record CreateVehicleRequest(
    string Make,
    string Model,
    int Year,
    int EngineCapacityCc,
    string PlateNumber,
    string Vin,
    // Agent/Admin must supply; Client's own customer id is taken from the token.
    Guid? CustomerId
);
