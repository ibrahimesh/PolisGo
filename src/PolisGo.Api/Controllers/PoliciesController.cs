using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;

namespace PolisGo.Api.Controllers;

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
    /// Creates a Draft policy. The premium is computed server-side from stored
    /// customer, vehicle and claims data — the request does not (and cannot)
    /// include a Premium field.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Client,Agent,Admin")]
    public async Task<ActionResult<PolicyResponse>> Create(
        [FromBody] CreatePolicyRequest request, CancellationToken cancellationToken)
    {
        var response = await _policies.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = response.Id }, response);
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<PolicyResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _policies.ListAsync(page, pageSize, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PolicyResponse>> GetById(
        Guid id, CancellationToken cancellationToken)
    {
        var policy = await _policies.GetByIdAsync(id, cancellationToken);
        return Ok(policy);
    }

    [HttpPost("{id:guid}/pay")]
    [Authorize(Roles = "Client,Agent,Admin")]
    public async Task<ActionResult<PayPolicyResponse>> Pay(
        Guid id, CancellationToken cancellationToken)
    {
        var response = await _policies.PayAsync(id, cancellationToken);
        return Ok(response);
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult<PolicyResponse>> Cancel(
        Guid id, CancellationToken cancellationToken)
    {
        var response = await _policies.CancelAsync(id, cancellationToken);
        return Ok(response);
    }
}
