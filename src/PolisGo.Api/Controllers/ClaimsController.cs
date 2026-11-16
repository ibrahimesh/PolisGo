using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Controllers;

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

    [HttpPost]
    [Authorize(Roles = "Client,Agent,Admin")]
    public async Task<ActionResult<ClaimResponse>> Submit(
        [FromBody] SubmitClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.SubmitAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = response.Id }, response);
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<ClaimResponse>>> List(
        [FromQuery] ClaimStatus? status,
        [FromQuery] bool? assignedToMe,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _claims.ListAsync(
            new ListClaimsFilter(status, assignedToMe, from, to, page, pageSize),
            cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClaimDetailResponse>> GetById(
        Guid id, CancellationToken cancellationToken)
    {
        var detail = await _claims.GetByIdAsync(id, cancellationToken);
        return Ok(detail);
    }

    [HttpGet("{id:guid}/history")]
    public async Task<ActionResult<IReadOnlyList<ClaimHistoryEntry>>> History(
        Guid id, CancellationToken cancellationToken)
    {
        var history = await _claims.GetHistoryAsync(id, cancellationToken);
        return Ok(history);
    }

    [HttpPost("{id:guid}/review")]
    [Authorize(Roles = "Adjuster,Admin")]
    public async Task<ActionResult<ClaimResponse>> Review(
        Guid id, [FromBody] ReviewClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.ReviewAsync(id, request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = "Adjuster,Admin")]
    public async Task<ActionResult<ClaimResponse>> Approve(
        Guid id, [FromBody] ApproveClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.ApproveAsync(id, request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = "Adjuster,Admin")]
    public async Task<ActionResult<ClaimResponse>> Reject(
        Guid id, [FromBody] RejectClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.RejectAsync(id, request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("{id:guid}/pay")]
    [Authorize(Roles = "Adjuster,Admin")]
    public async Task<ActionResult<ClaimResponse>> Pay(
        Guid id, [FromBody] PayClaimRequest request, CancellationToken cancellationToken)
    {
        var response = await _claims.PayAsync(id, request, cancellationToken);
        return Ok(response);
    }

    // ---------- Documents ----------

    [HttpPost("{id:guid}/documents")]
    [RequestSizeLimit(10 * 1024 * 1024)] // Outer ceiling; service rejects at 5 MB.
    public async Task<ActionResult<ClaimDocumentResponse>> UploadDocument(
        Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "File is required."
            });
        }

        await using var stream = file.OpenReadStream();
        var response = await _documents.UploadAsync(
            id, stream, file.FileName, file.Length, cancellationToken);
        return CreatedAtAction(nameof(DownloadDocument),
            new { id, docId = response.Id }, response);
    }

    [HttpGet("{id:guid}/documents/{docId:guid}")]
    public async Task<IActionResult> DownloadDocument(
        Guid id, Guid docId, CancellationToken cancellationToken)
    {
        var download = await _documents.DownloadAsync(id, docId, cancellationToken);
        return File(download.Content, download.ContentType, download.FileName);
    }
}
