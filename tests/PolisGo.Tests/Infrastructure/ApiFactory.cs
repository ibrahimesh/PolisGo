using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PolisGo.Api;
using Microsoft.Extensions.Hosting;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Diagnostics;
using PolisGo.Infrastructure.Diagnostics;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// Boots the real API pipeline (routing, JWT auth, role attributes, exception
// middleware, JSON options) over an in-memory SQLite database, so tests see
// the same status codes and payloads a client would.
public class ApiFactory : WebApplicationFactory<Program>
{
    private const string JwtSecret = "integration-tests-signing-key-at-least-32-chars";
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public ApiFactory()
    {
        _connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // UseSetting (not ConfigureAppConfiguration) so Program sees these
        // values while it is still building the host.
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", "Server=unused;Database=unused");
        builder.UseSetting("Jwt:SecretKey", JwtSecret);
        builder.UseSetting("Database:ApplyMigrationsOnStartup", "false");
        // POST /api/diagnostics/test-failure answers a real 500.
        builder.UseSetting("Diagnostics:TestFailures", "true");
        // One address signs up many users here; RateLimitEndpointTests tightens these.
        foreach (var policy in new[] { "SignIn", "Register", "PasswordChange" })
        {
            builder.UseSetting($"RateLimits:{policy}:PermitLimit", "100000");
        }

        builder.ConfigureTestServices(services =>
        {
            // Drop the SQL Server registration entirely; two providers in one
            // context's options would make EF throw.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_connection));

            // Background services share the one in-memory SQLite connection,
            // which isn't safe to use from two threads: tests drain the error
            // queue themselves (DrainErrorsAsync), and there are no old rows
            // to backfill search keys for.
            var background = services
                .Where(d => d.ServiceType == typeof(IHostedService)
                    && (d.ImplementationType == typeof(ErrorWriterService)
                        || d.ImplementationType == typeof(SearchKeyBackfillService)))
                .ToList();
            foreach (var descriptor in background) services.Remove(descriptor);
        });
    }

    // The async form: the context lives until the query has finished.
    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
        return await action(db);
    }

    // Stores whatever error reports requests have queued so far, as the
    // background writer would.
    public async Task DrainErrorsAsync()
    {
        var queue = Services.GetRequiredService<ChannelErrorReportQueue>();
        var batch = new List<ErrorReport>();
        while (queue.Reader.TryRead(out var report)) batch.Add(report);
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IErrorRecorder>().RecordAsync(batch);
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        using var scope = Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    }

    // Runs a callback against a fresh scoped DbContext (one "request").
    public T WithDb<T>(Func<AppDbContext, T> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
        return action(db);
    }

    // Creates a user with the role (Clients get a linked Customer, as at
    // registration) and returns a client carrying that user's real JWT.
    public HttpClient ClientAs(UserRole role) => ClientAs(role, out _);

    public HttpClient ClientAs(UserRole role, out Guid? customerId) => ClientAs(role, out _, out customerId);

    // Staff tests need the caller's user id (an agent's book, an adjuster's
    // assignments).
    public HttpClient ClientAs(UserRole role, out Guid userId, out Guid? customerId)
    {
        Guid? linkedCustomer = null;
        var createdUserId = Guid.Empty;
        var token = WithDb(db =>
        {
            var data = new TestData(db);
            var user = data.User(role);
            createdUserId = user.Id;
            if (role == UserRole.Client)
            {
                linkedCustomer = data.Customer(fullName: user.FullName, email: user.Email, userId: user.Id).Id;
            }

            using var scope = Services.CreateScope();
            var tokens = scope.ServiceProvider.GetRequiredService<IJwtTokenGenerator>();
            return tokens.GenerateToken(user, linkedCustomer).Token;
        });

        customerId = linkedCustomer;
        userId = createdUserId;
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }
}
