using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth;
using PolisGo.Application.Claims;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Customers;
using PolisGo.Application.Policies;
using PolisGo.Application.PolicyTypes;
using PolisGo.Application.Pricing;
using PolisGo.Application.Statistics;
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

        // Injected clock so time-windowed queries (stats) are testable;
        // TryAdd lets a host or test supply its own.
        services.TryAddSingleton(TimeProvider.System);
        services.AddMemoryCache();
        services.AddScoped<IAdminStatsService, AdminStatsService>();
        services.AddScoped<ICustomerService, CustomerService>();
        services.AddScoped<IPolicyTypeService, PolicyTypeService>();

        return services;
    }
}
