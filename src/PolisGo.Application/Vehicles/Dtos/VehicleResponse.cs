namespace PolisGo.Application.Vehicles.Dtos;

public record VehicleResponse(
    Guid Id,
    Guid CustomerId,
    string Make,
    string Model,
    int Year,
    int EngineCapacityCc,
    string PlateNumber,
    string Vin
);
