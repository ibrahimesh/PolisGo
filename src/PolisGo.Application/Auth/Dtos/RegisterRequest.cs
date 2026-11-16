namespace PolisGo.Application.Auth.Dtos;

public record RegisterRequest(
    string Email,
    string Password,
    string FullName,
    string Phone,
    DateTime BirthDate,
    DateTime DrivingLicenseDate
);
