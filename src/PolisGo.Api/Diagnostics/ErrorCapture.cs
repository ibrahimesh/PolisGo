using System.Security.Claims;
using Microsoft.AspNetCore.Routing;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;

namespace PolisGo.Api.Diagnostics;

// Turns a failed request into an ErrorReport and hands it to the queue. It
// reads only what it needs from the request (method, matched route template,
// the caller's role and id from the token, the user agent to reduce to a
// browser family); never the URL, the query, the body or other headers.
// Whatever goes wrong in here is swallowed: error tracking must never turn
// one failure into two.
public sealed class ErrorCapture(IErrorReportQueue queue, TimeProvider clock, ILogger<ErrorCapture> logger)
{
    public void Exception(HttpContext context, Exception exception) =>
        Enqueue(() =>
        {
            var (method, template, endpoint) = Route(context);
            return new ErrorReport(
                ErrorSource.Backend,
                clock.GetUtcNow().UtcDateTime,
                TraceIdOf(context),
                exception.GetType().FullName ?? exception.GetType().Name,
                exception.Message,
                exception.ToString(),
                ErrorFingerprint.ApplicationFrames(exception),
                endpoint,
                StatusCodes.Status500InternalServerError,
                method,
                template,
                RoleOf(context),
                UserIdOf(context),
                context.Request.Headers.UserAgent.ToString());
        });

    // A 5xx answered without an exception (an endpoint returning 503, a
    // dependency's status passed through).
    public void Status(HttpContext context) =>
        Enqueue(() =>
        {
            var (method, template, endpoint) = Route(context);
            var status = context.Response.StatusCode;
            return new ErrorReport(
                ErrorSource.Backend,
                clock.GetUtcNow().UtcDateTime,
                TraceIdOf(context),
                $"HTTP {status}",
                $"The request was answered with {status} without an exception.",
                null,
                [],
                endpoint,
                status,
                method,
                template,
                RoleOf(context),
                UserIdOf(context),
                context.Request.Headers.UserAgent.ToString());
        });

    private void Enqueue(Func<ErrorReport> build)
    {
        try
        {
            queue.TryEnqueue(build());
        }
        catch (Exception ex)
        {
            logger.LogWarning("Capturing an error failed ({Type}).", ex.GetType().Name);
        }
    }

    private static string TraceIdOf(HttpContext context) =>
        ErrorReference.TraceIdOf(RequestTrace.Id(context)) ?? ErrorReference.NewTraceId();

    private static (string Method, string? Template, string Endpoint) Route(HttpContext context)
    {
        var method = context.Request.Method.ToUpperInvariant();
        var template = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
        return (method, template, $"{method} {template ?? "(no route)"}");
    }

    private static UserRole? RoleOf(HttpContext context) =>
        context.User.Identity?.IsAuthenticated == true
        && Enum.TryParse<UserRole>(context.User.FindFirstValue(ClaimTypes.Role), out var role)
            ? role
            : null;

    private static Guid? UserIdOf(HttpContext context) =>
        context.User.Identity?.IsAuthenticated == true
        && Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id
            : null;
}
