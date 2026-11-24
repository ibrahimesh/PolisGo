using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// POST /api/diagnostics/client-errors: anonymous, small, strict, and of no
// use to someone who wants to flood the database or learn something.
public class ClientErrorEndpointTests : IClassFixture<ApiFactory>
{
    private const string Url = "/api/diagnostics/client-errors";
    private readonly ApiFactory _factory;

    public ClientErrorEndpointTests(ApiFactory factory) => _factory = factory;

    internal static object Report(string message = "Cannot read properties of undefined (reading 'name')", string? traceId = null) => new
    {
        kind = "boundary",
        message,
        name = "TypeError",
        stack = "TypeError: x\n    at ClaimPage (http://localhost:5173/src/features/claims/ClaimPage.tsx?t=1:10:5)",
        route = "/app/claims/:id",
        appVersion = "2.0.1",
        traceId
    };

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task An_anonymous_report_is_accepted_with_an_empty_answer_and_stored_redacted()
    {
        var traceId = ErrorReference.NewTraceId();
        var response = await _factory.CreateClient().PostAsJsonAsync(Url,
            Report($"Failed for leyla@polisgo.az on card 4111 1111 1111 1111 [{Guid.NewGuid():N}]", traceId));

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("", await response.Content.ReadAsStringAsync());

        await _factory.DrainErrorsAsync();
        var stored = await _factory.WithDbAsync(db => db.ErrorOccurrences.Include(o => o.Group)
            .SingleAsync(o => o.TraceId == traceId));
        Assert.Equal(ErrorSource.Frontend, stored.Group.Source);
        Assert.Equal("/app/claims/:id", stored.ClientRoute);
        Assert.Equal("/app/claims/:id", stored.Group.Endpoint);
        Assert.Equal("TypeError", stored.Group.ExceptionType);
        Assert.Null(stored.ActorRole);
        Assert.Null(stored.ActorUserId);
        Assert.DoesNotContain("leyla@", stored.Message);
        Assert.DoesNotContain("4111", stored.Message);
        // No origin and no query string from the script URL.
        Assert.DoesNotContain("localhost:5173", stored.StackTrace);
        Assert.DoesNotContain("?t=", stored.StackTrace);
        Assert.Contains("ClaimPage.tsx", stored.StackTrace);
    }

    // The role comes from the token; a body can't claim one.
    [Fact]
    public async Task The_actor_is_the_token_and_never_the_body()
    {
        var client = _factory.ClientAs(UserRole.Agent, out var agentId, out _);
        var traceId = ErrorReference.NewTraceId();

        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync(Url, Report(traceId: traceId))).StatusCode);
        var claimed = await client.PostAsJsonAsync(Url, new
        {
            kind = "error", message = "x", route = "/app", actorRole = "Admin", actorUserId = Guid.NewGuid()
        });
        await AssertProblem(claimed, HttpStatusCode.BadRequest);

        await _factory.DrainErrorsAsync();
        var stored = await _factory.WithDbAsync(db => db.ErrorOccurrences.SingleAsync(o => o.TraceId == traceId));
        Assert.Equal(UserRole.Agent, stored.ActorRole);
        Assert.Equal(agentId, stored.ActorUserId);
    }

    public static TheoryData<string> Invalid => new()
    {
        "not json",
        "{}",
        """{"kind":"error","message":"x","route":"/app","extra":1}""",
        """{"kind":"crash","message":"x","route":"/app"}""",
        """{"kind":"error","message":"","route":"/app"}""",
        """{"kind":"error","message":"x","route":"/app/claims?id=1"}""",
        """{"kind":"error","message":"x","route":"https://evil.example/app"}""",
        """{"kind":"error","message":"x","route":"/app","traceId":"not-a-trace"}""",
        """{"kind":"error","message":"x","route":"/app","httpStatus":42}""",
        """{"kind":"error","message":"x","route":"/app","name":"<script>"}""",
        """{"kind":"error","message":"x","route":"/app","appVersion":"1.0; DROP"}""",
    };

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task Anything_outside_the_schema_is_a_bare_400(string body)
    {
        var response = await _factory.CreateClient().PostAsync(Url, new StringContent(body, Encoding.UTF8, "application/json"));

        await AssertProblem(response, HttpStatusCode.BadRequest);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains(ClientErrorIntake.Messages.Invalid, text);
        // Nothing about which rule failed or how the API is built.
        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("JsonException", text);
    }

    [Fact]
    public async Task Over_8_KB_is_413_with_or_without_a_content_length()
    {
        var big = JsonSerializer.Serialize(new { kind = "error", message = "x", route = "/app", stack = new string('s', 9_000) });

        var declared = await _factory.CreateClient().PostAsync(Url, new StringContent(big, Encoding.UTF8, "application/json"));
        await AssertProblem(declared, HttpStatusCode.RequestEntityTooLarge);

        // Chunked: no Content-Length to go by; the cap holds while reading.
        var chunked = new HttpRequestMessage(HttpMethod.Post, Url)
        {
            Content = new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes(big)))
        };
        chunked.Headers.TransferEncodingChunked = true;
        chunked.Content.Headers.ContentType = new("application/json");
        await AssertProblem(await _factory.CreateClient().SendAsync(chunked), HttpStatusCode.RequestEntityTooLarge);
    }

    // The 400s and 413s above are expected answers, not errors to track:
    // a bad report must not create a backend error group about itself.
    [Fact]
    public async Task Refused_reports_leave_no_backend_error()
    {
        await _factory.CreateClient().PostAsync(Url, new StringContent("{}", Encoding.UTF8, "application/json"));
        await _factory.DrainErrorsAsync();
        Assert.False(await _factory.WithDbAsync(db =>
            db.ErrorGroups.AnyAsync(g => g.Endpoint.Contains("client-errors"))));
    }
}

// One address over its limit: 429 with Retry-After, counted for the health page.
public class ClientErrorAddressLimitTests : IClassFixture<ClientErrorAddressLimitTests.StrictPerAddress>
{
    public sealed class StrictPerAddress : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("RateLimits:ClientErrors:PermitLimit", "3");
            builder.UseSetting("RateLimits:ClientErrors:WindowSeconds", "60");
        }
    }

    private readonly StrictPerAddress _factory;
    public ClientErrorAddressLimitTests(StrictPerAddress factory) => _factory = factory;

    [Fact]
    public async Task The_fourth_report_in_a_minute_is_429()
    {
        var client = _factory.CreateClient();
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            statuses.Add((await client.PostAsJsonAsync("/api/diagnostics/client-errors", ClientErrorEndpointTests.Report())).StatusCode);
        }
        Assert.Equal([HttpStatusCode.Accepted, HttpStatusCode.Accepted, HttpStatusCode.Accepted, HttpStatusCode.TooManyRequests], statuses);
        var refused = await client.PostAsJsonAsync("/api/diagnostics/client-errors", ClientErrorEndpointTests.Report());
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.True(refused.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        Assert.True(_factory.Services.GetRequiredService<IRateLimitMonitor>().RejectionsInLast24Hours() >= 2);
    }
}

// Every address together past the shared budget: still 202 (the caller
// learns nothing), nothing queued, the drop counted.
public class ClientErrorBudgetTests : IClassFixture<ClientErrorBudgetTests.SmallBudget>
{
    public sealed class SmallBudget : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("RateLimits:ClientErrorsGlobal:PermitLimit", "2");
            builder.UseSetting("RateLimits:ClientErrorsGlobal:WindowSeconds", "60");
        }
    }

    private readonly SmallBudget _factory;
    public ClientErrorBudgetTests(SmallBudget factory) => _factory = factory;

    [Fact]
    public async Task Reports_past_the_budget_are_accepted_and_dropped()
    {
        var client = _factory.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            var response = await client.PostAsJsonAsync("/api/diagnostics/client-errors", ClientErrorEndpointTests.Report());
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }

        Assert.Equal(3, _factory.Services.GetRequiredService<IErrorReportQueue>().Dropped);
        await _factory.DrainErrorsAsync();
        Assert.Equal(2, await _factory.WithDbAsync(db => db.ErrorGroups.SumAsync(g => g.OccurrenceCount)));
    }
}
