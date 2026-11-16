using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Vehicles;
using PolisGo.Application.Vehicles.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/vehicles")]
[Authorize]
public class VehiclesController : ControllerBase
{
    private readonly IVehicleService _vehicles;

    public VehiclesController(IVehicleService vehicles)
    {
        _vehicles = vehicles;
    }

    [HttpPost]
    public async Task<ActionResult<VehicleResponse>> Create(
        [FromBody] CreateVehicleRequest request, CancellationToken cancellationToken)
    {
        var response = await _vehicles.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(List), new { customerId = response.CustomerId }, response);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<VehicleResponse>>> List(
        [FromQuery] Guid? customerId, CancellationToken cancellationToken)
    {
        var vehicles = await _vehicles.ListAsync(customerId, cancellationToken);
        return Ok(vehicles);
    }
}
