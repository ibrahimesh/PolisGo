using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using PolisGo.Api.Diagnostics;
using PolisGo.Api.Middleware;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Diagnostics;


namespace PolisGo.Tests.Diagnostics;

// The container log and a Development 500 are kept and read too: they must
// not carry what error tracking redacts before storing.
public class LogRedactionTests
{
    private const string Leaky =
        "Failed for leyla@polisgo.az with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl via Server=db;Database=PolisGo;User Id=sa;Password=Secret-123;";

    private sealed class CapturingLogger : ILogger<ExceptionHandlingMiddleware>
    {
        public ConcurrentQueue<string> Lines { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Lines.Enqueue(formatter(state, exception) + (exception is null ? "" : " | " + exception));
    }

    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = "";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private static async Task<(CapturingLogger Log, string Body)> Run(Exception exception)
    {
        var log = new CapturingLogger();
        var capture = new ErrorCapture(new RecordingQueue(), TimeProvider.System, NullLogger<ErrorCapture>.Instance);
        var middleware = new ExceptionHandlingMiddleware(_ => throw exception, log, new Env(Environments.Development), capture);
        var context = new DefaultHttpContext { Request = { Method = "POST", Path = "/api/x" } };
        var body = new MemoryStream();
        context.Response.Body = body;
        await middleware.InvokeAsync(context);
        return (log, System.Text.Encoding.UTF8.GetString(body.ToArray()));
    }

    [Fact]
    public async Task An_unhandled_exception_is_logged_and_shown_in_development_without_secrets()
    {
        var (log, body) = await Run(new InvalidOperationException(Leaky));

        var line = Assert.Single(log.Lines);
        foreach (var text in new[] { line, body })
        {
            Assert.DoesNotContain("leyla@", text);
            Assert.DoesNotContain("eyJ", text);
            Assert.DoesNotContain("Secret-123", text);
        }
        Assert.Contains("InvalidOperationException", line);
        Assert.Equal(Redaction.Message(Leaky), JsonDocument.Parse(body).RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task An_expected_error_is_logged_without_secrets_or_a_stack()
    {
        var (log, _) = await Run(new ConflictException(Leaky));

        var line = Assert.Single(log.Lines);
        Assert.DoesNotContain("leyla@", line);
        Assert.DoesNotContain("Secret-123", line);
        Assert.DoesNotContain(" at ", line);
    }
}

// A custom HTTP verb can be longer than the column; the recorder must cut
// it, or one odd request fails the whole batch on SQL Server.
[Trait("Category", "SqlServer")]
public class LongVerbTests
{
    [Fact]
    public Task Cut_on_sqlite() => Run(new Infrastructure.FileSqliteDb());

    [Infrastructure.SqlServerFact]
    public Task Cut_on_sql_server() => Run(new Infrastructure.SqlServerTestDb());

    private static async Task Run(Infrastructure.ITestDatabase database)
    {
        using var _ = database;
        var report = ErrorRecorderTests.Backend(DateTime.UtcNow) with { HttpMethod = "PROPFINDEXTENDED" };
        await new ErrorRecorder(database.NewContext(), new ErrorRecorderTests.TestApp(),
                Microsoft.Extensions.Options.Options.Create(new ErrorTrackingOptions()))
            .RecordAsync([report, ErrorRecorderTests.Backend(DateTime.UtcNow)]);
        await using var db = database.NewContext();
        Assert.Equal(2, db.ErrorOccurrences.Count());
        Assert.Contains(db.ErrorOccurrences, o => o.HttpMethod == "PROPFINDEX");

    }
}
