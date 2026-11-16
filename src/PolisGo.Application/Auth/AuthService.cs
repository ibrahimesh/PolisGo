using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Auth;

public class AuthService : IAuthService
{
    private readonly IApplicationDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;

    public AuthService(
        IApplicationDbContext db,
        IPasswordHasher passwordHasher,
        IJwtTokenGenerator jwtTokenGenerator)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        ValidateRegister(request);

        // Normalise email so duplicate detection is case-insensitive.
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new ConflictException("A user with this email already exists.");
        }

        var now = DateTime.UtcNow;

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FullName = request.FullName.Trim(),
            // Self-registration always creates a Client. Staff accounts must
            // be provisioned by an Admin through CreateStaffUserAsync.
            Role = UserRole.Client,
            CreatedAt = now
        };

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            Phone = request.Phone.Trim(),
            BirthDate = request.BirthDate.Date,
            DrivingLicenseDate = request.DrivingLicenseDate.Date,
            CreatedAt = now
        };

        _db.Users.Add(user);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(cancellationToken);

        var (token, expiresAt) = _jwtTokenGenerator.GenerateToken(user);
        return new AuthResponse(token, expiresAt, user.Email, user.FullName, user.Role);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            throw new UnauthorizedException();
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email, cancellationToken);

        // Same exception for unknown email and wrong password to avoid account enumeration.
        if (user is null || !_passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException();
        }

        var (token, expiresAt) = _jwtTokenGenerator.GenerateToken(user);
        return new AuthResponse(token, expiresAt, user.Email, user.FullName, user.Role);
    }

    public async Task<CurrentUserResponse> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new NotFoundException(nameof(User), userId);

        return new CurrentUserResponse(user.Id, user.Email, user.FullName, user.Role);
    }

    public async Task<CurrentUserResponse> CreateStaffUserAsync(CreateStaffUserRequest request, CancellationToken cancellationToken = default)
    {
        // Admin is seeded, not created via API — this endpoint is strictly for
        // operational staff provisioning.
        if (request.Role is not (UserRole.Agent or UserRole.Adjuster))
        {
            throw new ValidationException(nameof(request.Role),
                "Staff accounts may only have role Agent or Adjuster.");
        }

        ValidateEmail(request.Email);
        ValidatePassword(request.Password);
        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            throw new ValidationException(nameof(request.FullName), "Full name is required.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new ConflictException("A user with this email already exists.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FullName = request.FullName.Trim(),
            Role = request.Role,
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        return new CurrentUserResponse(user.Id, user.Email, user.FullName, user.Role);
    }

    private static void ValidateRegister(RegisterRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (!IsValidEmail(request.Email))
        {
            errors[nameof(request.Email)] = new[] { "Email is not a valid address." };
        }

        if (!IsStrongPassword(request.Password))
        {
            errors[nameof(request.Password)] = new[]
            {
                "Password must be at least 8 characters and contain both a letter and a digit."
            };
        }

        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            errors[nameof(request.FullName)] = new[] { "Full name is required." };
        }

        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            errors[nameof(request.Phone)] = new[] { "Phone is required." };
        }

        var today = DateTime.UtcNow.Date;

        if (request.BirthDate.Date >= today)
        {
            errors[nameof(request.BirthDate)] = new[] { "Birth date must be in the past." };
        }

        // Driver must have been at least 18 years old when the licence was issued.
        var earliestLicense = request.BirthDate.Date.AddYears(18);
        if (request.DrivingLicenseDate.Date < earliestLicense)
        {
            errors[nameof(request.DrivingLicenseDate)] = new[]
            {
                "Driving licence date must be after the customer turns 18."
            };
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private static void ValidateEmail(string email)
    {
        if (!IsValidEmail(email))
        {
            throw new ValidationException(nameof(email), "Email is not a valid address.");
        }
    }

    private static void ValidatePassword(string password)
    {
        if (!IsStrongPassword(password))
        {
            throw new ValidationException(nameof(password),
                "Password must be at least 8 characters and contain both a letter and a digit.");
        }
    }

    private static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        // MailAddress is strict enough for our purposes and ships with the BCL.
        try
        {
            var address = new MailAddress(email);
            return address.Address == email.Trim();
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool IsStrongPassword(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8) return false;
        var hasLetter = password.Any(char.IsLetter);
        var hasDigit = password.Any(char.IsDigit);
        return hasLetter && hasDigit;
    }
}
