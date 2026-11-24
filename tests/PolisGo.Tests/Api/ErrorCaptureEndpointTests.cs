using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Diagnostics;
using PolisGo.Domain.Enums;
using PolisGo.Tests.Infrastructure;

namespace PolisGo.Tests.Api;

// A real 500 through the whole pipeline: the traceId in the ProblemDetails
// is the one stored, the stored text is redacted, the actor is a role and an
// id, and the route is a template.
public class ErrorCaptureEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ErrorCaptureEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task A_500_is_stored_under_the_reference_the_caller_got()
    {
        var client = _factory.ClientAs(UserRole.Client, out var userId, out _);

        var response = await client.PostAsync("/api/diagnostics/test-failure?email=someone@polisgo.test", null);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var traceId = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement
            .GetProperty("traceId").GetString();
        var id = ErrorReference.TraceIdOf(traceId);
        Assert.NotNull(id);

        await _factory.DrainErrorsAsync();
        var stored = await _factory.WithDbAsync(db => db.ErrorOccurrences.Include(o => o.Group)
            .SingleAsync(o => o.TraceId == id));
        Assert.Equal(id![..8].ToUpperInvariant(), stored.ReferenceCode);
        Assert.Equal(500, stored.HttpStatus);
        Assert.Equal("POST", stored.HttpMethod);
        Assert.Equal("api/diagnostics/test-failure", stored.RouteTemplate);
        Assert.Equal("POST api/diagnostics/test-failure", stored.Group.Endpoint);
        Assert.Equal(UserRole.Client, stored.ActorRole);
        Assert.Equal(userId, stored.ActorUserId);
        Assert.Equal(ErrorSource.Backend, stored.Group.Source);
        Assert.Equal(typeof(InvalidOperationException).FullName, stored.Group.ExceptionType);
        foreach (var text in new[] { stored.Message, stored.StackTrace!, stored.Group.Title })
        {
            Assert.DoesNotContain("@polisgo.test", text);
            Assert.DoesNotContain("eyJ", text);
            Assert.DoesNotContain("4111", text);
        }
        Assert.Contains("Deliberate failure for the error tracking test", stored.Message);
    }

    [Fact]
    public async Task The_same_failure_twice_is_one_group_counted_twice()
    {
        var client = _factory.CreateClient();
        await client.PostAsync("/api/diagnostics/test-failure", null);
        await client.PostAsync("/api/diagnostics/test-failure", null);
        await _factory.DrainErrorsAsync();

        var groups = await _factory.WithDbAsync(db => db.ErrorGroups
            .Where(g => g.Endpoint == "POST api/diagnostics/test-failure").ToListAsync());
        var group = Assert.Single(groups);
        Assert.True(group.OccurrenceCount >= 2);
    }

    [Theory]
    [InlineData("GET", "/api/policies/00000000-0000-0000-0000-000000000001")] // 404
    [InlineData("GET", "/api/admin/stats")] // 403 for a client
    [InlineData("POST", "/api/vehicles")] // 400
    public async Task Expected_answers_leave_no_trace(string method, string url)
    {
        var client = _factory.ClientAs(UserRole.Client);
        var before = await _factory.WithDbAsync(db => db.ErrorOccurrences.CountAsync());

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), url)
        {
            Content = method == "POST" ? new StringContent("{}", System.Text.Encoding.UTF8, "application/json") : null
        });

        Assert.True((int)response.StatusCode is >= 400 and < 500, response.StatusCode.ToString());
        await _factory.DrainErrorsAsync();
        Assert.Equal(before, await _factory.WithDbAsync(db => db.ErrorOccurrences.CountAsync()));
    }
}
