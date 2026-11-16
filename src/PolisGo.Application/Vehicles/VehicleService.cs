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
        var plate = request.PlateNumber.Trim().ToUpperInvariant();
        var vin = request.Vin.Trim().ToUpperInvariant();

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

        if (string.IsNullOrWhiteSpace(request.Make))
            errors[nameof(request.Make)] = new[] { "Make is required." };
        if (string.IsNullOrWhiteSpace(request.Model))
            errors[nameof(request.Model)] = new[] { "Model is required." };
        if (string.IsNullOrWhiteSpace(request.PlateNumber))
            errors[nameof(request.PlateNumber)] = new[] { "Plate number is required." };
        if (string.IsNullOrWhiteSpace(request.Vin))
            errors[nameof(request.Vin)] = new[] { "VIN is required." };

        var currentYear = DateTime.UtcNow.Year;
        if (request.Year < 1950 || request.Year > currentYear + 1)
            errors[nameof(request.Year)] = new[] { $"Year must be between 1950 and {currentYear + 1}." };

        if (request.EngineCapacityCc <= 0)
            errors[nameof(request.EngineCapacityCc)] = new[] { "Engine capacity must be greater than zero." };

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private static VehicleResponse Map(Vehicle v) => new(
        v.Id, v.CustomerId, v.Make, v.Model, v.Year, v.EngineCapacityCc, v.PlateNumber, v.Vin);
}
