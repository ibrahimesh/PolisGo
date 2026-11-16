using PolisGo.Application.Auth.Dtos;

namespace PolisGo.Application.Abstractions;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);
    Task<CurrentUserResponse> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<CurrentUserResponse> CreateStaffUserAsync(CreateStaffUserRequest request, CancellationToken cancellationToken = default);
}
