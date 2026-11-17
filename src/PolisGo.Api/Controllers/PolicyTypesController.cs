using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.PolicyTypes;
using PolisGo.Application.PolicyTypes.Dtos;

namespace PolisGo.Api.Controllers;

[ApiController]
[Route("api/policy-types")]
[AllowAnonymous]
public class PolicyTypesController : ControllerBase
{
    private readonly IPolicyTypeService _policyTypes;

    public PolicyTypesController(IPolicyTypeService policyTypes)
    {
        _policyTypes = policyTypes;
    }

    /// <summary>
    /// The insurance products on offer (e.g. MTPL, CASCO), ordered by code.
    /// </summary>
    /// <remarks>
    /// Anonymous: the quote calculator needs it before sign-in. The list is
    /// the same for every caller, so it is publicly cacheable for 5 minutes.
    /// Use <c>code</c> as the value for <c>policyTypeCode</c> in quotes and policies.
    /// </remarks>
    /// <response code="200">All policy types.</response>
    [HttpGet]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    [ProducesResponseType<IReadOnlyList<PolicyTypeResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<PolicyTypeResponse>>> List(
        CancellationToken cancellationToken)
    {
        return Ok(await _policyTypes.ListAsync(cancellationToken));
    }
}
