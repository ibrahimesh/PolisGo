using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;

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

    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly IErrorReportQueue _queue;
    private readonly ClientErrorBudget _budget;
    private readonly TimeProvider _clock;

    public DiagnosticsController(IConfiguration configuration, IHostEnvironment environment, IErrorReportQueue queue,
        ClientErrorBudget budget, TimeProvider clock)
    {
        _configuration = configuration;
        _environment = environment;
        _queue = queue;
        _budget = budget;
        _clock = clock;
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        JsonConfiguration.Configure(options);
        return options;
    }

    /// <summary>
    /// Reports an error from the SPA: an uncaught exception, a rejected
    /// promise, a render crash, or a failed API call.
    /// </summary>
    /// <remarks>
    /// Anonymous, because a signed-out or expired session can crash too; the
    /// caller's role and id are taken from the bearer token when one is sent,
    /// never from the body. At most 8 KB; unknown fields are refused. The
    /// answer says nothing about what happened to the report: past the
    /// shared budget it is dropped, still with a 202. Message and stack are
    /// redacted before anything is stored.
    /// </remarks>
    /// <response code="202">Received.</response>
    /// <response code="400">Not a valid report.</response>
    /// <response code="413">Over 8 KB.</response>
    /// <response code="429">Too many reports from this address; see Retry-After.</response>
    [HttpPost("client-errors")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.ClientErrors)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> ClientError(CancellationToken cancellationToken)
    {
        var body = await ReadCappedAsync(cancellationToken);
        ClientErrorReport? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<ClientErrorReport>(body, Json);
        }
        catch (JsonException)
        {
            throw new ValidationException("report", ClientErrorIntake.Messages.Invalid);
        }

        var report = ClientErrorIntake.ToReport(parsed, _clock.GetUtcNow().UtcDateTime, RoleOf(User), IdOf(User),
            Request.Headers.UserAgent.ToString());
        if (_budget.TryTake()) _queue.TryEnqueue(report);
        else _queue.CountDropped(1);
        return Accepted();
    }

    // The body, up to the cap and never more: a larger one is refused before
    // it is read, whatever Content-Length claims.
    private async Task<byte[]> ReadCappedAsync(CancellationToken cancellationToken)
    {
        const int max = ClientErrorIntake.MaxBodyBytes;
        if (Request.ContentLength > max) throw new PayloadTooLargeException(ClientErrorIntake.Messages.TooLarge);
        var buffer = new byte[max + 1];
        var read = 0;
        while (read < buffer.Length)
        {
            var n = await Request.Body.ReadAsync(buffer.AsMemory(read), cancellationToken);
            if (n == 0) break;
            read += n;
        }
        if (read > max) throw new PayloadTooLargeException(ClientErrorIntake.Messages.TooLarge);
        return buffer[..read];
    }

    private static UserRole? RoleOf(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && Enum.TryParse<UserRole>(user.FindFirstValue(ClaimTypes.Role), out var role)
            ? role
            : null;

    private static Guid? IdOf(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id
            : null;

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
