using PolisGo.Domain.Enums;

namespace PolisGo.Application.Auth.Dtos;

public record AuthResponse(
    string Token,
    DateTime ExpiresAt,
    string Email,
    string FullName,
    UserRole Role
);
