using Microsoft.AspNetCore.Mvc;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Exceptions;
using AppUnauthorizedException = PolisGo.Application.Common.Exceptions.UnauthorizedException;

namespace PolisGo.Api.Middleware;

// Single choke-point for turning domain/application exceptions into HTTP
// responses. Keeps controllers free of try/catch noise.
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ValidationException ex)
        {
            await WriteProblem(context, StatusCodes.Status400BadRequest, "Validation failed", ex.Message, ex.Errors);
        }
        catch (AppUnauthorizedException ex)
        {
            await WriteProblem(context, StatusCodes.Status401Unauthorized, "Unauthorized", ex.Message);
        }
        catch (NotFoundException ex)
        {
            await WriteProblem(context, StatusCodes.Status404NotFound, "Not found", ex.Message);
        }
        catch (ConflictException ex)
        {
            await WriteProblem(context, StatusCodes.Status409Conflict, "Conflict", ex.Message);
        }
        catch (InvalidPolicyStateException ex)
        {
            // Domain state-transition failure (e.g. activating a Cancelled policy).
            // Semantically identical to a conflict from the HTTP point of view.
            await WriteProblem(context, StatusCodes.Status409Conflict, "Invalid policy state", ex.Message);
        }
        catch (Exception ex)
        {
            // Unhandled — log everything, return a generic message. Never leak
            // stack traces or framework internals to the client.
            _logger.LogError(ex, "Unhandled exception while processing {Path}", context.Request.Path);
            var detail = _environment.IsDevelopment() ? ex.Message : "An unexpected error occurred.";
            await WriteProblem(context, StatusCodes.Status500InternalServerError, "Server error", detail);
        }
    }

    private static Task WriteProblem(
        HttpContext context,
        int status,
        string title,
        string detail,
        IReadOnlyDictionary<string, string[]>? errors = null)
    {
        if (context.Response.HasStarted)
        {
            return Task.CompletedTask;
        }

        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";

        var problem = errors is null
            ? (ProblemDetails)new ProblemDetails
            {
                Status = status,
                Title = title,
                Detail = detail,
                Instance = context.Request.Path
            }
            : new ValidationProblemDetails(errors.ToDictionary(kv => kv.Key, kv => kv.Value))
            {
                Status = status,
                Title = title,
                Detail = detail,
                Instance = context.Request.Path
            };

        return context.Response.WriteAsJsonAsync(problem);
    }
}
