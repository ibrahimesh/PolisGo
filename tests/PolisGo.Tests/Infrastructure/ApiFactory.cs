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
using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Infrastructure.Persistence;

namespace PolisGo.Tests.Infrastructure;

// Boots the real API pipeline (routing, JWT auth, role attributes, exception
// middleware, JSON options) over an in-memory SQLite database, so tests see
// the same status codes and payloads a client would.
public sealed class ApiFactory : WebApplicationFactory<Program>
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

        builder.ConfigureTestServices(services =>
        {
            // Drop the SQL Server registration entirely; two providers in one
            // context's options would make EF throw.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_connection));
        });
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
