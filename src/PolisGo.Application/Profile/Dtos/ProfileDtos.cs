using PolisGo.Domain.Enums;

namespace PolisGo.Application.Profile.Dtos;

// The signed-in user's own account. Customer fields are null for staff
// accounts, which have no customer profile.
public record ProfileResponse(
    Guid Id,
    string Email,
    string FullName,
    UserRole Role,
    string? Phone,
    DateOnly? BirthDate,
    DateOnly? DrivingLicenseDate,
    DateTime CreatedAt
);

// Email, birth and licence dates are deliberately not editable here: email is
// the login, and the dates drive pricing, so changing them is a staff action.
public record UpdateProfileRequest(
    string FullName,
    // Required for Clients; staff accounts have no phone on file.
    string? Phone
);

public record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword
);
