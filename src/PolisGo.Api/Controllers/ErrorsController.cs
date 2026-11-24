using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common;
using PolisGo.Application.Diagnostics;
using PolisGo.Application.Diagnostics.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Controllers;

/// <summary>
/// The System section's error tracking: grouped errors from the API and the
/// SPA, their occurrences, lookup by Reference, and triage.
/// </summary>
[ApiController]
[Route("api/admin/errors")]
[Authorize(Roles = "Admin")]
[Produces("application/json")]
public class ErrorsController : ControllerBase
{
    private readonly IErrorTrackingService _errors;

    public ErrorsController(IErrorTrackingService errors) => _errors = errors;

    /// <summary>
    /// Error groups (one per bug), filtered, searched and sorted.
    /// </summary>
    /// <param name="source">Backend or Frontend.</param>
    /// <param name="status">New, Resolved or Ignored.</param>
    /// <param name="regressed">Only groups that came back after being resolved (true) or not (false).</param>
    /// <param name="from">Last seen on or after this Baku day.</param>
    /// <param name="to">Last seen on or before this Baku day.</param>
    /// <param name="httpStatus">An HTTP status the error was answered with.</param>
    /// <param name="endpoint">Part of the endpoint or route template.</param>
    /// <param name="role">The role of a caller who hit it.</param>
    /// <param name="search">Title, type or endpoint text, or a Reference ("8F05E497", with or without a
    /// dash or spaces) or a full trace id; at most 100 characters.</param>
    /// <param name="sort">LastSeen (default), Count or FirstSeen; newest or most first.</param>
    /// <param name="page">1-based page, at most 200.</param>
    /// <param name="pageSize">Items per page, 1–50.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">A page of groups.</response>
    /// <response code="400">An invalid filter, a reversed range or a search over 100 characters.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet]
    [ProducesResponseType<PagedResult<ErrorGroupRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResult<ErrorGroupRow>>> List(
        [FromQuery] ErrorSource? source,
        [FromQuery] ErrorStatus? status,
        [FromQuery] bool? regressed,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int? httpStatus,
        [FromQuery] string? endpoint,
        [FromQuery] UserRole? role,
        [FromQuery] string? search,
        [FromQuery] ErrorSort sort = ErrorSort.LastSeen,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _errors.ListAsync(new ErrorListQuery(source, status, regressed, from, to, httpStatus, endpoint,
            role, search, sort, page, pageSize), cancellationToken));
    }

    /// <summary>
    /// The overview: errors per hour for the last 24 hours and per Baku day
    /// for the last 7, the most frequent current groups, and how many are
    /// unresolved or regressed.
    /// </summary>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">The summary.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpGet("summary")]
    [ProducesResponseType<ErrorSummaryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ErrorSummaryResponse>> Summary(CancellationToken cancellationToken) =>
        Ok(await _errors.SummaryAsync(cancellationToken));

    /// <summary>
    /// Finds the error behind a Reference a user quoted.
    /// </summary>
    /// <param name="reference">"8F05E497" (case, a dash and spaces don't matter) or a full trace id.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">The newest matching occurrence and its group.</response>
    /// <response code="400">Not a Reference or a trace id.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No stored occurrence has it (it may have expired).</response>
    [HttpGet("lookup")]
    [ProducesResponseType<ErrorLookupResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ErrorLookupResponse>> Lookup([FromQuery] string? reference,
        CancellationToken cancellationToken) =>
        Ok(await _errors.LookupAsync(reference ?? string.Empty, cancellationToken));

    /// <summary>
    /// One error group with its most recent occurrences.
    /// </summary>
    /// <param name="id">The group's id.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">The group.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No such group.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<ErrorGroupDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ErrorGroupDetail>> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await _errors.GetAsync(id, cancellationToken));

    /// <summary>
    /// Resolves, ignores or reopens (status New) a group, with an optional note.
    /// </summary>
    /// <remarks>
    /// Send the <c>rowVersion</c> you loaded: if the group changed since
    /// (another admin, or the error came back), the answer is 409 "Concurrent
    /// update". Every change is recorded in the audit log.
    /// </remarks>
    /// <param name="id">The group's id.</param>
    /// <param name="request">The new status, a note (at most 1000 characters) and the rowVersion.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">The group after the change.</response>
    /// <response code="400">A note over 1000 characters or an invalid status.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    /// <response code="404">No such group.</response>
    /// <response code="409">Already in that status, or changed since it was loaded.</response>
    [HttpPatch("{id:guid}")]
    [ProducesResponseType<ErrorGroupDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ErrorGroupDetail>> UpdateStatus(Guid id, [FromBody] UpdateErrorStatusRequest request,
        CancellationToken cancellationToken) =>
        Ok(await _errors.UpdateStatusAsync(id, request, cancellationToken));

    /// <summary>
    /// Deletes resolved groups (and their occurrences) resolved more than
    /// <paramref name="olderThanDays"/> days ago.
    /// </summary>
    /// <param name="olderThanDays">1–3650; 30 by default.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">How many groups were deleted. Recorded in the audit log.</response>
    /// <response code="400">Days out of range.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Admin.</response>
    [HttpDelete("resolved")]
    [ProducesResponseType<PurgeResolvedResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PurgeResolvedResponse>> PurgeResolved([FromQuery] int olderThanDays = 30,
        CancellationToken cancellationToken = default) =>
        Ok(await _errors.PurgeResolvedAsync(olderThanDays, cancellationToken));
}
