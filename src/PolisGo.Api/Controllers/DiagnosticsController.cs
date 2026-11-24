using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common.Exceptions;

namespace PolisGo.Api.Controllers;

/// <summary>
/// Error reporting from the SPA, and a deliberate failure for tests.
/// </summary>
[ApiController]
[Route("api/diagnostics")]
[Produces("application/json")]
public class DiagnosticsController : ControllerBase
{
    // Only when Diagnostics:TestFailures is set (the e2e compose override and
    // the test factory), and never in Production.
    public const string TestFailuresSetting = "Diagnostics:TestFailures";

    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;

    public DiagnosticsController(IConfiguration configuration, IHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    /// <summary>
    /// Fails on purpose with an unhandled exception (a 500), so tests can
    /// follow an error from the user's Reference to the System section.
    /// </summary>
    /// <remarks>
    /// Exists only when <c>Diagnostics:TestFailures</c> is true outside
    /// Production; a 404 otherwise. The message carries a fake email, token
    /// and card number, which error tracking must redact before storing.
    /// </remarks>
    /// <response code="404">Test failures are not enabled here.</response>
    /// <response code="500">Always, when enabled.</response>
    [HttpPost("test-failure")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public IActionResult TestFailure()
    {
        if (_environment.IsProduction() || !_configuration.GetValue<bool>(TestFailuresSetting))
        {
            throw new NotFoundException("Not found.");
        }
        throw new InvalidOperationException(
            "Deliberate failure for the error tracking test: customer test.customer@polisgo.test, " +
            "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXZhbHVl, card 4111 1111 1111 1111.");
    }
}
