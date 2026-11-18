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

    /// <summary>
    /// Registers a vehicle for a customer.
    /// </summary>
    /// <remarks>
    /// Clients always register for themselves (any <c>customerId</c> in the
    /// body is ignored); Agents and Admins must pass one, and an Agent only for
    /// a customer assigned to them. Plate and VIN are upper-cased; the plate
    /// must be unique across the registry.
    /// </remarks>
    /// <response code="201">The vehicle.</response>
    /// <response code="400">One or more fields are invalid (errors keyed by field).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">Staff passed an unknown customer id, or one outside their scope.</response>
    /// <response code="409">The plate number is already registered.</response>
    [HttpPost]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<VehicleResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<VehicleResponse>> Create(
        [FromBody] CreateVehicleRequest request, CancellationToken cancellationToken)
    {
        var response = await _vehicles.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(List), new { customerId = response.CustomerId }, response);
    }

    /// <summary>
    /// Vehicles, ordered by plate number.
    /// </summary>
    /// <remarks>
    /// Clients see only their own (the <c>customerId</c> filter is ignored for
    /// them); staff see the vehicles of customers in their scope (as in
    /// GET /api/customers) and may filter by customer.
    /// </remarks>
    /// <response code="200">The vehicles.</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<VehicleResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IReadOnlyList<VehicleResponse>>> List(
        [FromQuery] Guid? customerId, CancellationToken cancellationToken)
    {
        var vehicles = await _vehicles.ListAsync(customerId, cancellationToken);
        return Ok(vehicles);
    }
}
