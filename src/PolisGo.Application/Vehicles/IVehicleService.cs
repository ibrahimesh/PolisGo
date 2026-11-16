using PolisGo.Application.Vehicles.Dtos;

namespace PolisGo.Application.Vehicles;

public interface IVehicleService
{
    Task<VehicleResponse> CreateAsync(CreateVehicleRequest request, CancellationToken cancellationToken = default);

    // Clients see only their own vehicles; Agents/Admins can optionally filter
    // by customer. Null customerId for staff means "no filter".
    Task<IReadOnlyList<VehicleResponse>> ListAsync(Guid? customerId, CancellationToken cancellationToken = default);
}
