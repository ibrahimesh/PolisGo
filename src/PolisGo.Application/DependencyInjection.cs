using Microsoft.Extensions.DependencyInjection;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth;

namespace PolisGo.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuthService, AuthService>();
        return services;
    }
}
