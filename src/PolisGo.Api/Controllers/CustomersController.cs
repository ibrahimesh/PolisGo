using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;

namespace PolisGo.Api.Controllers;

// Staff-only directory. Clients get 403 here; they keep using the
// self-scoped /api/vehicles, /api/policies and /api/claims endpoints.
[ApiController]
[Route("api/customers")]
[Authorize(Roles = "Admin,Agent,Adjuster")]
public class CustomersController : ControllerBase
{
    private readonly ICustomerService _customers;

    public CustomersController(ICustomerService customers)
    {
        _customers = customers;
    }

    /// <summary>
    /// Paged customer directory with optional search and sorting.
    /// </summary>
    /// <param name="search">Matches name, email or phone (phone ignores spaces, dashes and brackets). Max 100 characters.</param>
    /// <param name="sortBy">CreatedAt (default), FullName or Email.</param>
    /// <param name="sortDir">Asc or Desc (default).</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <remarks>
    /// Policy and claim counts follow the caller's visibility: Agents count
    /// only policies they sold, Adjusters only claims open to them.
    /// </remarks>
    /// <response code="200">A page of customers.</response>
    /// <response code="400">Invalid sort value or search too long.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is a Client.</response>
    [HttpGet]
    [ProducesResponseType<PagedResult<CustomerListItem>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResult<CustomerListItem>>> List(
        [FromQuery] string? search,
        [FromQuery] CustomerSortBy sortBy = CustomerSortBy.CreatedAt,
        [FromQuery] SortDirection sortDir = SortDirection.Desc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _customers.ListAsync(
            new ListCustomersQuery(search, sortBy, sortDir, page, pageSize), cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// One customer with their vehicles, policies and a claims summary.
    /// </summary>
    /// <remarks>
    /// Policies and claims use the same visibility rules as
    /// GET /api/policies and GET /api/claims for the caller's role.
    /// </remarks>
    /// <response code="200">The customer.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is a Client.</response>
    /// <response code="404">No customer with this id.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<CustomerDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CustomerDetailResponse>> GetById(
        Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _customers.GetByIdAsync(id, cancellationToken));
    }
}
