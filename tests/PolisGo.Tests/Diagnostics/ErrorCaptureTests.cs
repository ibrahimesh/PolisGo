using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;
using PolisGo.Tests.Middleware;

namespace PolisGo.Tests.Diagnostics;

// What the exception middleware hands to error tracking, and what it never
// does: capture an expected answer, or let capturing break the response.
public class ErrorCaptureTests
{
    private static (HttpContext Context, MemoryStream Body) NewContext()
    {
        var context = new DefaultHttpContext { Request = { Method = "post", Path = "/api/policies/7/pay" } };
        context.Request.QueryString = new QueryString("?token=abc");
        context.Request.Headers.UserAgent = "Mozilla/5.0 Chrome/131.0 Safari/537.36";
        var body = new MemoryStream();
        context.Response.Body = body;
        return (context, body);
    }

    private static async Task<string> TraceIdOf(MemoryStream body)
    {
        body.Position = 0;
        using var doc = await JsonDocument.ParseAsync(body);
        return doc.RootElement.GetProperty("traceId").GetString()!;
    }

    public static TheoryData<Exception> Expected => new()
    {
        new ValidationException("Email", "Email required."),
        new UnauthorizedException("Invalid credentials."),
        new NotFoundException("Policy", Guid.Empty),
        new ConflictException("Already paid."),
        new ConcurrencyConflictException(),
        new InvalidStateTransitionException("Not allowed."),
        new DbUpdateConcurrencyException("stale"),
        new TooManyRequestsException(null),
    };

    [Theory]
    [MemberData(nameof(Expected))]
    public async Task Expected_answers_are_not_errors(Exception exception)
    {
        var queue = new RecordingQueue();
        var (context, _) = NewContext();

        await ExceptionHandlingMiddlewareTests.Build(_ => throw exception, queue).InvokeAsync(context);

        Assert.True(context.Response.StatusCode < 500);
        Assert.Empty(queue.Reports);
    }

    [Theory]
    [InlineData(StatusCodes.Status400BadRequest)]
    [InlineData(StatusCodes.Status403Forbidden)]
    [InlineData(StatusCodes.Status404NotFound)]
    [InlineData(StatusCodes.Status412PreconditionFailed)]
    public async Task Expected_statuses_without_an_exception_are_not_errors(int status)
    {
        var queue = new RecordingQueue();
        var (context, _) = NewContext();

        await ExceptionHandlingMiddlewareTests.Build(c => { c.Response.StatusCode = status; return Task.CompletedTask; }, queue)
            .InvokeAsync(context);

        Assert.Empty(queue.Reports);
    }

    [Fact]
    public async Task An_unhandled_exception_is_queued_with_the_trace_id_the_client_sees()
    {
        var queue = new RecordingQueue();
        var (context, body) = NewContext();

        await ExceptionHandlingMiddlewareTests.Build(_ => throw new InvalidOperationException("boom"), queue)
            .InvokeAsync(context);

        Assert.Equal(500, context.Response.StatusCode);
        var report = Assert.Single(queue.Reports);
        var traceId = await TraceIdOf(body);
        Assert.Equal(ErrorReference.TraceIdOf(traceId), report.TraceId);
        Assert.Equal(ErrorSource.Backend, report.Source);
        Assert.Equal(typeof(InvalidOperationException).FullName, report.ExceptionType);
        Assert.Equal("POST", report.HttpMethod);
        Assert.Equal("POST (no route)", report.Endpoint);
        Assert.Equal(500, report.HttpStatus);
        // Nothing from the URL beyond the method; no query string anywhere.
        Assert.DoesNotContain("token", report.Endpoint);
        Assert.Null(report.ActorRole);
    }

    [Fact]
    public async Task A_5xx_without_an_exception_is_an_error_too()
    {
        var queue = new RecordingQueue();
        var (context, _) = NewContext();

        await ExceptionHandlingMiddlewareTests.Build(c => { c.Response.StatusCode = 503; return Task.CompletedTask; }, queue)
            .InvokeAsync(context);

        var report = Assert.Single(queue.Reports);
        Assert.Equal("HTTP 503", report.ExceptionType);
        Assert.Equal(503, report.HttpStatus);
    }

    // A request the client abandoned (a navigation cancelling a fetch) isn't
    // an error, whatever the database driver throws when its query is
    // cancelled: the e2e suite logged 145 "500s" like this on SQL Server.
    [Theory]
    [InlineData(typeof(OperationCanceledException))]
    [InlineData(typeof(InvalidOperationException))]
    public async Task A_request_the_client_abandoned_is_neither_logged_as_500_nor_tracked(Type thrown)
    {
        var queue = new RecordingQueue();
        var (context, body) = NewContext();
        using var aborted = new CancellationTokenSource();
        context.RequestAborted = aborted.Token;

        await ExceptionHandlingMiddlewareTests.Build(_ =>
        {
            aborted.Cancel();
            throw (Exception)Activator.CreateInstance(thrown, "Operation cancelled by user.")!;
        }, queue).InvokeAsync(context);

        Assert.Empty(queue.Reports);
        Assert.Equal(0, body.Length);
    }

    // The queue throwing, or being full, changes nothing for the caller.
    [Fact]
    public async Task Capturing_never_breaks_or_changes_the_response()
    {
        foreach (var queue in new IErrorReportQueue[] { new ThrowingQueue(), new RecordingQueue(capacity: 0) })
        {
            var (context, body) = NewContext();
            await ExceptionHandlingMiddlewareTests.Build(_ => throw new InvalidOperationException("boom"), queue)
                .InvokeAsync(context);
            Assert.Equal(500, context.Response.StatusCode);
            Assert.False(string.IsNullOrEmpty(await TraceIdOf(body)));
        }
    }

    private sealed class ThrowingQueue : IErrorReportQueue
    {
        public bool TryEnqueue(ErrorReport report) => throw new InvalidOperationException("queue is broken");
        public int Depth => 0;
        public long Dropped => 0;
        public void CountDropped(int reports) { }
    }
}

// Collects reports instead of writing them; full past `capacity`.
internal sealed class RecordingQueue(int capacity = int.MaxValue) : IErrorReportQueue
{
    private long _dropped;
    public ConcurrentQueue<ErrorReport> Reports { get; } = new();

    public bool TryEnqueue(ErrorReport report)
    {
        if (Reports.Count >= capacity)
        {
            Interlocked.Increment(ref _dropped);
            return false;
        }
        Reports.Enqueue(report);
        return true;
    }

    public int Depth => Reports.Count;
    public long Dropped => Interlocked.Read(ref _dropped);
    public void CountDropped(int reports) => Interlocked.Add(ref _dropped, reports);
}
