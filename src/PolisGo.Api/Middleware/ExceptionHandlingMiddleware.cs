using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Exceptions;
using AppUnauthorizedException = PolisGo.Application.Common.Exceptions.UnauthorizedException;

namespace PolisGo.Api.Middleware;

// Single choke-point for turning domain/application/db exceptions into HTTP
// responses. Controllers and services deliberately contain no try/catch —
// this is the one place they are allowed.
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
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client disconnected — not actionable, and log noise would drown real issues.
            return;
        }
        catch (ValidationException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status400BadRequest, "Validation failed", ex.Message, ex.Errors);
        }
        catch (AppUnauthorizedException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status401Unauthorized, "Unauthorized", ex.Message);
        }
        catch (NotFoundException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status404NotFound, "Not found", ex.Message);
        }
        // Before ConflictException, which it extends: same title as EF's own
        // concurrency failure below, so clients handle both one way.
        catch (ConcurrencyConflictException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict, ConcurrentUpdateTitle, ex.Message);
        }
        catch (ConflictException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict, "Conflict", ex.Message);
        }
        catch (InvalidStateTransitionException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict, "Invalid state transition", ex.Message);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict,
                ConcurrentUpdateTitle, ConcurrencyConflictException.DefaultMessage);
        }
        // SQL Server ends a serializable race (the last-admin rule) by killing
        // one transaction: that caller collided with another, as above.
        catch (Exception ex) when (IsDeadlockVictim(ex))
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict,
                ConcurrentUpdateTitle, ConcurrencyConflictException.DefaultMessage);
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            LogExpected(ex, context);
            await WriteProblem(context, StatusCodes.Status409Conflict,
                "Duplicate value",
                "A record with the same unique identifier already exists.");
        }
        catch (Exception ex)
        {
            // Anything we didn't anticipate: log full stack trace server-side,
            // tell the client only a generic message with the traceId.
            var traceId = GetTraceId(context);
            _logger.LogError(ex,
                "Unhandled exception for {Method} {Path} (trace {TraceId})",
                context.Request.Method, context.Request.Path, traceId);
            await WriteProblem(context, StatusCodes.Status500InternalServerError,
                "Server error",
                // Only expose details in Development — never in production.
                _environment.IsDevelopment()
                    ? ex.Message
                    : "An unexpected error occurred. Please contact support with the trace id.");
        }
    }

    public const string ConcurrentUpdateTitle = "Concurrent update";

    private void LogExpected(Exception ex, HttpContext context)
    {
        _logger.LogWarning(ex,
            "Expected domain error for {Method} {Path}: {Type} - {Message}",
            context.Request.Method, context.Request.Path, ex.GetType().Name, ex.Message);
    }

    private Task WriteProblem(
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

        var traceId = GetTraceId(context);

        ProblemDetails problem = errors is null
            ? new ProblemDetails()
            : new ValidationProblemDetails(errors.ToDictionary(kv => kv.Key, kv => kv.Value));

        problem.Status = status;
        problem.Title = title;
        problem.Detail = detail;
        problem.Instance = context.Request.Path;
        // Echo the trace id so clients can correlate reports with server logs.
        problem.Extensions["traceId"] = traceId;

        // Serialize against the runtime type so ValidationProblemDetails
        // includes its Errors dictionary (the base-type overload would strip it).
        // Pass the media type explicitly: WriteAsJsonAsync otherwise resets
        // Content-Type to application/json, dropping the RFC 7807 type set above.
        return context.Response.WriteAsJsonAsync(
            problem, problem.GetType(), options: null, contentType: "application/problem+json");
    }

    private static string GetTraceId(HttpContext context)
        => Activity.Current?.Id ?? context.TraceIdentifier;

    // SQL Server error 1205 ("... was deadlocked ... chosen as the deadlock
    // victim"), wrapped by EF or not. Text, like the check below, so the Api
    // needn't reference the provider's exception types.
    private static bool IsDeadlockVictim(Exception ex)
    {
        for (Exception? e = ex; e is not null; e = e.InnerException)
        {
            if (e.Message.Contains("deadlock victim", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        // Cross-provider heuristic: SQL Server uses 2601/2627, SQLite uses 19.
        // Checking the inner exception's SQLSTATE/number is cheaper than
        // reflecting over provider-specific types.
        var inner = ex.InnerException;
        while (inner is not null)
        {
            var text = inner.Message;
            if (text.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase)) return true;
            if (text.Contains("duplicate key", StringComparison.OrdinalIgnoreCase)) return true;
            inner = inner.InnerException;
        }
        return false;
    }
}
