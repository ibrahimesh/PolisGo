using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Controllers;

// Rows are scoped by PolicyAccess inside the service: Clients see their own,
// Agents the ones they sold, Adjusters and Admins all. A policy outside the
// caller's scope is a 404, never a 403, so its existence isn't leaked.
[ApiController]
[Route("api/policies")]
[Authorize]
public class PoliciesController : ControllerBase
{
    private readonly IPolicyService _policies;

    public PoliciesController(IPolicyService policies)
    {
        _policies = policies;
    }

    /// <summary>
    /// Prices a prospective policy from stored data, without creating it.
    /// </summary>
    /// <remarks>
    /// Uses the customer's stored birth and licence dates, the vehicle and the
    /// customer's approved claims — the same calculation as
    /// <c>POST /api/policies</c>, so the result is the premium that will be
    /// charged today. Runs the same checks too (dates, term, ownership, overlap).
    /// </remarks>
    /// <response code="200">The premium and its factors.</response>
    /// <response code="400">Invalid start date, term or missing fields.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">Unknown policy type, or a vehicle the caller can't use.</response>
    /// <response code="409">A Draft or Active policy of this type already covers the vehicle then.</response>
    [HttpPost("quote")]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<PremiumBreakdown>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PremiumBreakdown>> Quote(
        [FromBody] CreatePolicyRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _policies.QuoteAsync(request, cancellationToken));
    }

    /// <summary>
    /// Creates a Draft policy. The premium is computed server-side from stored
    /// customer, vehicle and claims data — the request does not (and cannot)
    /// include a Premium field.
    /// </summary>
    /// <response code="201">The Draft policy.</response>
    /// <response code="400">Invalid start date, term or missing fields.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">Unknown policy type, a vehicle the caller can't use, or (Agents) a customer not assigned to them.</response>
    /// <response code="409">A Draft or Active policy of this type already covers the vehicle then.</response>
    [HttpPost]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<PolicyResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PolicyResponse>> Create(
        [FromBody] CreatePolicyRequest request, CancellationToken cancellationToken)
    {
        var response = await _policies.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = response.Id }, response);
    }

    /// <summary>
    /// Paged, filterable list of the policies the caller can see.
    /// </summary>
    /// <param name="status">Effective status: Expired includes Active policies past their end date.</param>
    /// <param name="type">Policy type code, e.g. MTPL.</param>
    /// <param name="search">Part of a policy number, plate or holder name, any case. Max 100 characters.</param>
    /// <param name="sortBy">CreatedAt (default), StartDate, EndDate, Premium or PolicyNumber.</param>
    /// <param name="sortDir">Asc or Desc (default).</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="agentId">Only policies this agent sold (within the caller's scope).</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">A page of policies.</response>
    /// <response code="400">Invalid filter or sort value, or search too long.</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpGet]
    [ProducesResponseType<PagedResult<PolicyResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<PagedResult<PolicyResponse>>> List(
        [FromQuery] PolicyStatus? status,
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] PolicySortBy sortBy = PolicySortBy.CreatedAt,
        [FromQuery] SortDirection sortDir = SortDirection.Desc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] Guid? agentId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _policies.ListAsync(
            new ListPoliciesQuery(status, type, search, sortBy, sortDir, page, pageSize, agentId), cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// The caller's policies as CSV, with the same filters and sort as GET /api/policies.
    /// </summary>
    /// <remarks>
    /// UTF-8 with a BOM (Excel reads Cyrillic and Azerbaijani letters
    /// correctly), comma-separated, CRLF line ends. Text cells starting with
    /// = + - @ are prefixed with an apostrophe so a spreadsheet never runs
    /// them as formulas. Statuses are effective. At most 5000 rows.
    /// </remarks>
    /// <response code="200">The CSV file.</response>
    /// <response code="400">Invalid filter or sort value, search too long, or more than 5000 rows.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Agent or Admin.</response>
    [HttpGet("export")]
    [Authorize(Roles = "Agent,Admin")]
    [ProducesResponseType<FileContentResult>(StatusCodes.Status200OK, "text/csv")]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Export(
        [FromQuery] PolicyStatus? status,
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] PolicySortBy sortBy = PolicySortBy.CreatedAt,
        [FromQuery] SortDirection sortDir = SortDirection.Desc,
        [FromQuery] Guid? agentId = null,
        CancellationToken cancellationToken = default)
    {
        var policies = await _policies.ExportAsync(
            new ListPoliciesQuery(status, type, search, sortBy, sortDir, AgentId: agentId), cancellationToken);
        return File(CsvExports.Policies(policies), "text/csv; charset=utf-8",
            $"policies-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    /// <summary>
    /// One policy with its vehicle, holder, pricing, payments and status history.
    /// </summary>
    /// <remarks>
    /// <c>pricing</c> holds the factors frozen at issue and is null for
    /// policies issued before they were recorded. History is oldest first; the
    /// expiry step is derived from the end date and marked <c>automatic</c>.
    /// </remarks>
    /// <response code="200">The policy.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such policy, or one the caller can't see.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<PolicyDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PolicyDetailResponse>> GetById(
        Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _policies.GetDetailAsync(id, cancellationToken));
    }

    /// <summary>
    /// Pays a Draft policy through the payment gateway and activates it.
    /// </summary>
    /// <remarks>
    /// The amount is the stored premium, never a client value. The gateway in
    /// this build is a fake that always succeeds.
    /// </remarks>
    /// <response code="200">The payment and the now Active policy.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">No such policy, or one the caller can't see.</response>
    /// <response code="409">Not a Draft any more, or its start date has passed.</response>
    [HttpPost("{id:guid}/pay")]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<PayPolicyResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PayPolicyResponse>> Pay(
        Guid id, CancellationToken cancellationToken)
    {
        var response = await _policies.PayAsync(id, cancellationToken);
        return Ok(response);
    }

    /// <summary>
    /// Cancels a Draft or Active policy.
    /// </summary>
    /// <response code="200">The cancelled policy.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such policy, or one the caller can't see.</response>
    /// <response code="409">Already cancelled or expired.</response>
    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType<PolicyResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PolicyResponse>> Cancel(
        Guid id, CancellationToken cancellationToken)
    {
        var response = await _policies.CancelAsync(id, cancellationToken);
        return Ok(response);
    }
}
