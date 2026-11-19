using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common;
using PolisGo.Application.Customers;
using PolisGo.Application.Customers.Dtos;

namespace PolisGo.Api.Controllers;

// Staff-only directory, scoped by CustomerAccess: Agents see the customers
// assigned to them, Adjusters those with a claim in their reach, Admins all.
// A customer outside the scope is a 404. Clients get 403 here; they keep using
// the self-scoped /api/vehicles, /api/policies and /api/claims endpoints.
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
    /// <param name="search">Matches name, email or phone; a term written like a phone (digits, spaces, + - ( )) matches phone digits. Max 100 characters.</param>
    /// <param name="sortBy">CreatedAt (default), FullName or Email.</param>
    /// <param name="sortDir">Asc or Desc (default).</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="agentId">Only the customers assigned to this agent (within the caller's scope).</param>
    /// <param name="unassigned">True: only customers no agent looks after; wins over agentId.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <remarks>
    /// Rows: Agents get their own customers, Adjusters the customers with a
    /// claim in the queue or assigned to them, Admins everyone. Policy and
    /// claim counts follow the same visibility as GET /api/policies and
    /// GET /api/claims; the active count uses the effective status.
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
        [FromQuery] Guid? agentId = null,
        [FromQuery] bool unassigned = false,
        CancellationToken cancellationToken = default)
    {
        var result = await _customers.ListAsync(
            new ListCustomersQuery(search, sortBy, sortDir, page, pageSize, agentId, unassigned), cancellationToken);
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
    /// <response code="404">No customer with this id, or one outside the caller's scope.</response>
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

    /// <summary>Assigns a customer to an agent, or releases them with a null agentId.</summary>
    /// <remarks>
    /// The agent then sees the customer in their directory and can sell to
    /// them; policies already sold stay with the agent who sold them. The
    /// change is recorded in the audit log.
    /// </remarks>
    /// <response code="204">Assigned (or already assigned so).</response>
    /// <response code="400">agentId is not an active Agent account.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No customer with this id.</response>
    [HttpPut("{id:guid}/agent")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignAgent(
        Guid id, [FromBody] AssignAgentRequest request, CancellationToken cancellationToken)
    {
        await _customers.AssignAgentAsync(id, request, cancellationToken);
        return NoContent();
    }
}
