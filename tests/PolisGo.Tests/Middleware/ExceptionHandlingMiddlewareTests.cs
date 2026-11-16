using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using PolisGo.Api.Middleware;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Exceptions;
using Xunit;

namespace PolisGo.Tests.Middleware;

public class ExceptionHandlingMiddlewareTests
{
    private static (HttpContext ctx, MemoryStream body) NewContext()
    {
        var context = new DefaultHttpContext
        {
            TraceIdentifier = "trace-xyz",
            Request = { Method = "POST", Path = "/api/claims" }
        };
        var body = new MemoryStream();
        context.Response.Body = body;
        return (context, body);
    }

    private static ExceptionHandlingMiddleware Build(RequestDelegate next, bool development = false)
    {
        var env = new TestEnv { EnvironmentName = development ? Environments.Development : Environments.Production };
        return new ExceptionHandlingMiddleware(next,
            NullLogger<ExceptionHandlingMiddleware>.Instance, env);
    }

    private static async Task<JsonElement> ReadProblem(MemoryStream body)
    {
        body.Position = 0;
        using var doc = await JsonDocument.ParseAsync(body);
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Maps_ValidationException_To_400_WithFieldErrors()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new ValidationException("Email", "Email required."));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status400BadRequest, ctx.Response.StatusCode);
        var json = await ReadProblem(body);
        Assert.Equal("Validation failed", json.GetProperty("title").GetString());
        Assert.True(json.TryGetProperty("errors", out var errors));
        Assert.True(errors.TryGetProperty("Email", out _));
        // traceId is either Activity.Current.Id (W3C-style, dot-separated) or
        // HttpContext.TraceIdentifier — both are non-empty strings.
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Maps_NotFoundException_To_404()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new NotFoundException("Claim", Guid.NewGuid()));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status404NotFound, ctx.Response.StatusCode);
        var json = await ReadProblem(body);
        Assert.Equal("Not found", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Maps_ConflictException_To_409()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new ConflictException("duplicate"));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status409Conflict, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task Maps_InvalidStateTransitionException_To_409()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new InvalidStateTransitionException("cannot approve"));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status409Conflict, ctx.Response.StatusCode);
        var json = await ReadProblem(body);
        Assert.Contains("cannot approve", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Maps_DbUpdateConcurrencyException_To_409()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new DbUpdateConcurrencyException("race"));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status409Conflict, ctx.Response.StatusCode);
        var json = await ReadProblem(body);
        Assert.Equal("Concurrent update", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Maps_DbUpdateException_UniqueViolation_To_409()
    {
        var (ctx, body) = NewContext();
        // Message contains "UNIQUE" so the middleware heuristic catches it.
        var inner = new InvalidOperationException("SQLite Error 19: UNIQUE constraint failed");
        var middleware = Build(_ => throw new DbUpdateException("save failed", inner));

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status409Conflict, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task Unknown_Exception_In_Production_Returns_Generic_500_WithTraceIdOnly()
    {
        var (ctx, body) = NewContext();
        var middleware = Build(_ => throw new InvalidOperationException("secret-internal-detail"),
            development: false);

        await middleware.InvokeAsync(ctx);

        Assert.Equal(StatusCodes.Status500InternalServerError, ctx.Response.StatusCode);
        var json = await ReadProblem(body);
        // No stack trace, no inner message exposed.
        var detail = json.GetProperty("detail").GetString();
        Assert.DoesNotContain("secret-internal-detail", detail);
        Assert.True(json.TryGetProperty("traceId", out var traceId));
        Assert.False(string.IsNullOrWhiteSpace(traceId.GetString()));
    }

    [Fact]
    public async Task OperationCanceled_WhenRequestAborted_IsSilentlySwallowed()
    {
        var (ctx, body) = NewContext();
        // Simulate aborted request.
        var cts = new CancellationTokenSource();
        cts.Cancel();
        ctx.RequestAborted = cts.Token;

        var middleware = Build(_ => throw new OperationCanceledException(cts.Token));

        await middleware.InvokeAsync(ctx);

        // No response body written; response code untouched.
        Assert.Equal(0, body.Length);
    }

    private sealed class TestEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "PolisGo.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
