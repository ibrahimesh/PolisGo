using Microsoft.Extensions.DependencyInjection;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Policies;
using PolisGo.Application.Pricing;
using PolisGo.Application.Vehicles;

namespace PolisGo.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuthService, AuthService>();

        // PremiumCalculator is a pure function with no state — singleton is safe
        // and avoids per-request allocation.
        services.AddSingleton<IPremiumCalculator, PremiumCalculator>();
        services.AddScoped<IQuoteService, QuoteService>();

        services.AddScoped<IVehicleService, VehicleService>();
        services.AddScoped<IPolicyService, PolicyService>();
        services.AddScoped<IClaimService, ClaimService>();
        services.AddScoped<IClaimDocumentService, ClaimDocumentService>();

        return services;
    }
}
