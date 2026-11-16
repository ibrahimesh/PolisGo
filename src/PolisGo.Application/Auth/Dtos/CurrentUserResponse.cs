using PolisGo.Domain.Enums;

namespace PolisGo.Application.Auth.Dtos;

public record CurrentUserResponse(
    Guid Id,
    string Email,
    string FullName,
    UserRole Role
);
