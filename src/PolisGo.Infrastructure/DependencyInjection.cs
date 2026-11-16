using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims;
using PolisGo.Infrastructure.Auth;
using PolisGo.Infrastructure.Payments;
using PolisGo.Infrastructure.Persistence;
using PolisGo.Infrastructure.Storage;

namespace PolisGo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "Connection string 'Default' is not configured.");

        services.AddDbContext<AppDbContext>(options =>
            options.UseSqlServer(connectionString));

        // The Application layer only knows about IApplicationDbContext — register
        // the concrete context under the interface so AuthService can resolve it.
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();
        services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();

        // Fake gateways for now — replace with real PSP/payout adapters when needed.
        services.AddSingleton<IPaymentGateway, FakePaymentGateway>();
        services.AddSingleton<IPayoutGateway, FakePayoutGateway>();

        // Claim options: binds a "Claims" section if present; falls back to the
        // defaults baked into ClaimOptions otherwise.
        services.Configure<ClaimOptions>(configuration.GetSection(ClaimOptions.SectionName));

        services.Configure<FileStorageOptions>(configuration.GetSection(FileStorageOptions.SectionName));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        // Options bound to configuration; validation runs eagerly so a misconfigured
        // SecretKey causes a startup failure, not a 500 on the first login.
        services.AddOptions<JwtSettings>()
            .Bind(configuration.GetSection(JwtSettings.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<JwtSettings>, JwtSettingsValidator>();

        return services;
    }
}
