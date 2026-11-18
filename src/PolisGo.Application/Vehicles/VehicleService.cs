using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Vehicles.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Vehicles;

public class VehicleService : IVehicleService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;

    public VehicleService(IApplicationDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<VehicleResponse> CreateAsync(
        CreateVehicleRequest request, CancellationToken cancellationToken = default)
    {
        var customerId = ResolveCustomerId(request.CustomerId);

        ValidateInput(request);

        if (!await _db.Customers.AnyAsync(c => c.Id == customerId, cancellationToken))
        {
            throw new NotFoundException(nameof(Customer), customerId);
        }

        // Normalise plate so duplicate detection and comparisons are reliable
        // regardless of how the client typed it.
        var plate = VehicleValidation.NormalizePlate(request.PlateNumber);
        var vin = VehicleValidation.NormalizeVin(request.Vin);

        if (await _db.Vehicles.AnyAsync(v => v.PlateNumber == plate, cancellationToken))
        {
            throw new ConflictException("A vehicle with this plate number is already registered.");
        }

        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            Make = request.Make.Trim(),
            Model = request.Model.Trim(),
            Year = request.Year,
            EngineCapacityCc = request.EngineCapacityCc,
            PlateNumber = plate,
            Vin = vin
        };

        _db.Vehicles.Add(vehicle);
        await _db.SaveChangesAsync(cancellationToken);

        return Map(vehicle);
    }

    public async Task<IReadOnlyList<VehicleResponse>> ListAsync(
        Guid? customerId, CancellationToken cancellationToken = default)
    {
        var query = _db.Vehicles.AsNoTracking().AsQueryable();

        if (_currentUser.Role == UserRole.Client)
        {
            // Clients always see only their own vehicles — the customerId query
            // parameter is ignored to prevent probing other customers.
            if (!_currentUser.CustomerId.HasValue)
            {
                return Array.Empty<VehicleResponse>();
            }
            query = query.Where(v => v.CustomerId == _currentUser.CustomerId);
        }
        else if (customerId.HasValue)
        {
            query = query.Where(v => v.CustomerId == customerId.Value);
        }

        var vehicles = await query.OrderBy(v => v.PlateNumber).ToListAsync(cancellationToken);
        return vehicles.Select(Map).ToList();
    }

    private Guid ResolveCustomerId(Guid? requestedCustomerId)
    {
        if (_currentUser.Role == UserRole.Client)
        {
            // Client's customer id ALWAYS comes from the token; anything in the
            // request body is ignored to stop a client from acting on another
            // customer's record.
            if (!_currentUser.CustomerId.HasValue)
            {
                throw new UnauthorizedException("Client account has no linked customer profile.");
            }
            return _currentUser.CustomerId.Value;
        }

        if (!requestedCustomerId.HasValue)
        {
            throw new ValidationException("customerId", "customerId is required for staff accounts.");
        }
        return requestedCustomerId.Value;
    }

    private static void ValidateInput(CreateVehicleRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        void Check(string field, string? error)
        {
            if (error is not null) errors[field] = [error];
        }

        Check(nameof(request.Make), VehicleValidation.MakeError(request.Make));
        Check(nameof(request.Model), VehicleValidation.ModelError(request.Model));
        Check(nameof(request.PlateNumber), VehicleValidation.PlateError(request.PlateNumber));
        Check(nameof(request.Vin), VehicleValidation.VinError(request.Vin));
        Check(nameof(request.Year), VehicleValidation.YearError(request.Year, DateTime.UtcNow.Year));
        Check(nameof(request.EngineCapacityCc), VehicleValidation.EngineCapacityError(request.EngineCapacityCc));

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    internal static VehicleResponse Map(Vehicle v) => new(
        v.Id, v.CustomerId, v.Make, v.Model, v.Year, v.EngineCapacityCc, v.PlateNumber, v.Vin);
}
