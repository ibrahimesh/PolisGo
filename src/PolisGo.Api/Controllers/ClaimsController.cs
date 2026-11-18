using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Controllers;

// Rows are scoped by ClaimAccess inside the services: Clients see claims on
// their own policies, Agents those on policies they sold, Adjusters the queue
// and their own, Admins all. A claim outside that scope is a 404, never a 403.
[ApiController]
[Route("api/claims")]
[Authorize]
public class ClaimsController : ControllerBase
{
    private readonly IClaimService _claims;
    private readonly IClaimDocumentService _documents;

    public ClaimsController(IClaimService claims, IClaimDocumentService documents)
    {
        _claims = claims;
        _documents = documents;
    }

    /// <summary>
    /// Files a claim on an active policy.
    /// </summary>
    /// <remarks>
    /// The incident date must fall inside the policy period and not in the
    /// future; the amount is at most the configured limit (50,000 AZN) with
    /// two decimals. Documents are uploaded afterwards, one request per file.
    /// </remarks>
    /// <response code="201">The Submitted claim.</response>
    /// <response code="400">One or more fields are invalid (errors keyed by field).</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">No such policy, or one the caller can't use.</response>
    /// <response code="409">A claim with the same policy, incident date and amount is already on file.</response>
    [HttpPost]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Submit(
        [FromBody] SubmitClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.SubmitAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = response.Id }, response);
    }

    /// <summary>
    /// Paged, filterable list of the claims the caller can see.
    /// </summary>
    /// <param name="status">One status; wins over <paramref name="open"/>.</param>
    /// <param name="open">True: only Submitted and UnderReview claims.</param>
    /// <param name="assignedToMe">Adjusters: only claims assigned to the caller.</param>
    /// <param name="from">Incident on or after this date.</param>
    /// <param name="to">Incident on or before this date.</param>
    /// <param name="search">Part of a claim or policy number, any case. Max 100 characters.</param>
    /// <param name="sortBy">CreatedAt (default), IncidentDate, ClaimedAmount or ClaimNumber.</param>
    /// <param name="sortDir">Asc or Desc (default).</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page; capped at 50.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">A page of claims.</response>
    /// <response code="400">Invalid filter or sort value, or search too long.</response>
    /// <response code="401">No or invalid bearer token.</response>
    [HttpGet]
    [ProducesResponseType<PagedResult<ClaimResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<PagedResult<ClaimResponse>>> List(
        [FromQuery] ClaimStatus? status,
        [FromQuery] bool? open,
        [FromQuery] bool? assignedToMe,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? search,
        [FromQuery] ClaimSortBy sortBy = ClaimSortBy.CreatedAt,
        [FromQuery] SortDirection sortDir = SortDirection.Desc,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _claims.ListAsync(
            new ListClaimsFilter(status, assignedToMe, from, to, page, pageSize, open, search, sortBy, sortDir),
            cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// One claim with its policy, status history, documents and what the
    /// caller may do next.
    /// </summary>
    /// <response code="200">The claim.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<ClaimDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ClaimDetailResponse>> GetById(
        Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _claims.GetByIdAsync(id, cancellationToken));
    }

    /// <summary>
    /// The claim's status history, oldest first, with who made each change.
    /// </summary>
    /// <response code="200">The history.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    [HttpGet("{id:guid}/history")]
    [ProducesResponseType<IReadOnlyList<ClaimHistoryEntry>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ClaimHistoryEntry>>> History(
        Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _claims.GetHistoryAsync(id, cancellationToken));
    }

    /// <summary>
    /// Withdraws a claim that has no decision yet (Submitted or UnderReview).
    /// </summary>
    /// <remarks>The optional reason (max 500 characters) is kept in the history.</remarks>
    /// <response code="200">The Withdrawn claim.</response>
    /// <response code="400">Reason too long.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is an Adjuster.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">The claim already has a decision or was withdrawn.</response>
    [HttpPost("{id:guid}/withdraw")]
    [Authorize(Roles = "Client,Agent,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Withdraw(
        Guid id, [FromBody] WithdrawClaimRequest? request, CancellationToken cancellationToken)
    {
        return Ok(await _claims.WithdrawAsync(id, request ?? new WithdrawClaimRequest(null), cancellationToken));
    }

    /// <summary>Takes a Submitted claim into review and assigns it to the caller.</summary>
    /// <response code="200">The claim, now UnderReview.</response>
    /// <response code="400">Comment longer than 1000 characters.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Adjuster or Admin.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">The claim is not Submitted.</response>
    [HttpPost("{id:guid}/review")]
    [Authorize(Roles = "Adjuster,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Review(
        Guid id, [FromBody] ReviewClaimRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _claims.ReviewAsync(id, request, cancellationToken));
    }

    /// <summary>Approves a claim under review for an amount up to the claimed one.</summary>
    /// <response code="200">The Approved claim.</response>
    /// <response code="400">Comment longer than 1000 characters.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Adjuster or Admin.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">Not under review, not the assigned adjuster, or an invalid amount.</response>
    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = "Adjuster,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Approve(
        Guid id, [FromBody] ApproveClaimRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _claims.ApproveAsync(id, request, cancellationToken));
    }

    /// <summary>Rejects a claim under review; the reason is required.</summary>
    /// <response code="200">The Rejected claim.</response>
    /// <response code="400">Comment longer than 1000 characters.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Adjuster or Admin.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">Not under review, not the assigned adjuster, or no reason.</response>
    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = "Adjuster,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Reject(
        Guid id, [FromBody] RejectClaimRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _claims.RejectAsync(id, request, cancellationToken));
    }

    /// <summary>Pays out an Approved claim through the payout gateway.</summary>
    /// <response code="200">The Paid claim.</response>
    /// <response code="400">Comment longer than 1000 characters.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="403">The caller is not an Adjuster or Admin.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">The claim is not Approved.</response>
    [HttpPost("{id:guid}/pay")]
    [Authorize(Roles = "Adjuster,Admin")]
    [ProducesResponseType<ClaimResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimResponse>> Pay(
        Guid id, [FromBody] PayClaimRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _claims.PayAsync(id, request, cancellationToken));
    }

    // ---------- Documents ----------

    /// <summary>
    /// Attaches one document (photo or PDF) to an open claim.
    /// </summary>
    /// <remarks>
    /// multipart/form-data with a <c>file</c> part. JPEG, PNG or PDF up to
    /// 5 MB, checked against the file's first bytes, not only its name; at
    /// most 10 per claim. The stored name is the leaf name with path and
    /// unsafe characters removed; the file itself is saved under a server
    /// chosen name.
    /// </remarks>
    /// <response code="201">The stored document.</response>
    /// <response code="400">Missing file, wrong type, content not matching the type, or size out of range.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such claim, or one the caller can't see.</response>
    /// <response code="409">The claim is closed or already has 10 documents.</response>
    [HttpPost("{id:guid}/documents")]
    [RequestSizeLimit(10 * 1024 * 1024)] // Outer ceiling; service rejects at 5 MB.
    [ProducesResponseType<ClaimDocumentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ClaimDocumentResponse>> UploadDocument(
        Guid id, IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            throw new ValidationException("file", ClaimValidation.Messages.FileRequired);
        }

        await using var stream = file.OpenReadStream();
        var response = await _documents.UploadAsync(
            id, stream, file.FileName, file.Length, cancellationToken);
        return CreatedAtAction(nameof(DownloadDocument),
            new { id, docId = response.Id }, response);
    }

    /// <summary>Downloads one document of a claim.</summary>
    /// <response code="200">The file, with its content type and name.</response>
    /// <response code="401">No or invalid bearer token.</response>
    /// <response code="404">No such claim or document, or one the caller can't see.</response>
    [HttpGet("{id:guid}/documents/{docId:guid}")]
    [ProducesResponseType<FileStreamResult>(StatusCodes.Status200OK, "image/jpeg", "image/png", "application/pdf")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadDocument(
        Guid id, Guid docId, CancellationToken cancellationToken)
    {
        var download = await _documents.DownloadAsync(id, docId, cancellationToken);
        return File(download.Content, download.ContentType, download.FileName);
    }
}
