using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using PolisGo.Api.Auth;
using PolisGo.Api.Middleware;
using PolisGo.Application;
using PolisGo.Infrastructure;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Application.Abstractions;

namespace PolisGo.Api;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers()
            .AddJsonOptions(options => JsonConfiguration.Configure(options.JsonSerializerOptions));

        // Swashbuckle (instead of the minimal AddOpenApi) for the "Authorize"
        // button users need to paste Bearer tokens during manual testing.
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(ConfigureSwagger);

        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);

        // Liveness + DB connectivity probe. Anonymous so orchestrators (compose,
        // Kubernetes, load balancers) can poll without a credential.
        builder.Services.AddHealthChecks()
            .AddDbContextCheck<AppDbContext>("database");

        // CurrentUser needs HttpContext to read claims; register the accessor
        // and the scoped resolver that reads them once per request.
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, CurrentUser>();

        // JWT Bearer. The signing key comes from the same options that
        // Infrastructure already validated at startup.
        var jwt = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
            ?? throw new InvalidOperationException("Jwt configuration section is missing.");

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SecretKey)),
                    // Tight clock skew so expired tokens are rejected promptly.
                    ClockSkew = TimeSpan.FromSeconds(30)
                };
                // Deactivated users and rotated stamps end sessions at once.
                options.Events = new JwtBearerEvents { OnTokenValidated = SessionValidator.ValidateAsync };
            });

        builder.Services.AddAuthorization();

        builder.Services.AddCors(options => ConfigureFrontendCors(options, builder.Configuration));

        var app = builder.Build();

        // Runs first so every downstream exception hits ProblemDetails formatting.
        app.UseMiddleware<ExceptionHandlingMiddleware>();

        // Migrations run before the app starts serving traffic so the first
        // request after a deploy doesn't race the schema update.
        await ApplyMigrationsIfConfiguredAsync(app);

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();

            // Dev-only admin bootstrap; no-op if the user-secrets aren't set.
            await using var scope = app.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            await DatabaseSeeder.SeedDevelopmentAsync(db, builder.Configuration, hasher);
        }

        await SeedDemoDataIfEnabledAsync(app);

        // HTTPS redirection would 307 every /health call to :443 inside the
        // container where no HTTPS listener exists — enable only when at least
        // one configured URL actually speaks HTTPS.
        var urls = builder.Configuration["ASPNETCORE_URLS"] ?? string.Empty;
        if (urls.Contains("https://", StringComparison.OrdinalIgnoreCase))
        {
            app.UseHttpsRedirection();
        }

        // Before auth so browser preflights (OPTIONS, no Authorization header)
        // are answered here instead of being challenged with a 401.
        app.UseCors(FrontendCorsPolicy);

        app.UseAuthentication();
        app.UseAuthorization();

        // Health probe stays anonymous even though [Authorize] is applied at
        // controller level.
        app.MapHealthChecks("/health").AllowAnonymous();

        app.MapControllers();

        await app.RunAsync();
    }

    // Demo:SeedData=true fills an empty system with demo accounts and
    // history (docker-compose.demo.yml). Refused in Production.
    private static async Task SeedDemoDataIfEnabledAsync(WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("Demo:SeedData")) return;

        await using var scope = app.Services.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup.DemoData");
        var result = await DemoDataSeeder.SeedIfEnabledAsync(
            services.GetRequiredService<AppDbContext>(),
            app.Configuration,
            app.Environment.EnvironmentName,
            services.GetRequiredService<IPasswordHasher>(),
            services.GetRequiredService<PolisGo.Application.Pricing.IPremiumCalculator>(),
            services.GetRequiredService<TimeProvider>());

        if (result == DemoSeedResult.RefusedInProduction)
        {
            logger.LogCritical("Demo:SeedData is set in Production; demo data was NOT seeded.");
        }
        else
        {
            logger.LogInformation("Demo data: {Result}.", result);
        }
    }

    private const string FrontendCorsPolicy = "Frontend";

    // Explicit origin allow-list from config: the SPA authenticates with a
    // Bearer header (not cookies), so credentials stay disabled and a wildcard
    // origin is rejected outright to avoid accidental "allow everything".
    private static void ConfigureFrontendCors(
        Microsoft.AspNetCore.Cors.Infrastructure.CorsOptions options, IConfiguration configuration)
    {
        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173", "http://localhost:3000"];

        if (origins.Any(o => o.Contains('*')))
        {
            throw new InvalidOperationException("Cors:AllowedOrigins must list explicit origins, not wildcards.");
        }

        options.AddPolicy(FrontendCorsPolicy, policy => policy
            .WithOrigins(origins)
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
            .WithHeaders("Authorization", "Content-Type", "Accept", "Accept-Language")
            // Lets the client read the file name of downloaded claim documents.
            .WithExposedHeaders("Content-Disposition")
            .SetPreflightMaxAge(TimeSpan.FromMinutes(10)));
    }

    // When Database:ApplyMigrationsOnStartup=true (compose/docker defaults),
    // apply pending migrations with a retry loop so the container survives
    // SQL Server's warm-up window on the first boot.
    private static async Task ApplyMigrationsIfConfiguredAsync(WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("Database:ApplyMigrationsOnStartup"))
        {
            return;
        }

        var logger = app.Services
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("Startup.Migrations");

        const int maxAttempts = 20;
        const int delaySeconds = 3;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await using var scope = app.Services.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.MigrateAsync();
                logger.LogInformation("Migrations applied on startup (attempt {Attempt}).", attempt);
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger.LogWarning(ex,
                    "Migration attempt {Attempt} failed; retrying in {Delay}s.",
                    attempt, delaySeconds);
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds));
            }
        }

        throw new InvalidOperationException(
            $"Database migrations failed to apply after {maxAttempts} attempts.");
    }

    private static void ConfigureSwagger(Swashbuckle.AspNetCore.SwaggerGen.SwaggerGenOptions options)
    {
        options.SwaggerDoc("v1", new OpenApiInfo { Title = "PolisGo API", Version = "v1" });

        // Surface XML triple-slash comments (summaries, remarks) in Swagger UI.
        var xmlFile = Path.Combine(AppContext.BaseDirectory, "PolisGo.Api.xml");
        if (File.Exists(xmlFile))
        {
            options.IncludeXmlComments(xmlFile);
        }

        // Render enums inline as their string names (matches the JSON
        // serializer config) instead of showing integer schemas.
        options.UseInlineDefinitionsForEnums();

        // Bearer scheme + requirement so the Authorize button appears and sends
        // the token on every subsequent request.
        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Paste the JWT returned from /api/auth/login — no 'Bearer ' prefix needed."
        });

        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            [new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            }] = Array.Empty<string>()
        });
    }
}
