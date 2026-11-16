using PolisGo.Domain.Enums;

namespace PolisGo.Application.Auth.Dtos;

public record CreateStaffUserRequest(
    string Email,
    string Password,
    string FullName,
    UserRole Role
);
