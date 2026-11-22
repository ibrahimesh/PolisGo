using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
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
    private readonly TimeProvider _clock;

    public AuthService(
        IApplicationDbContext db,
        IPasswordHasher passwordHasher,
        IJwtTokenGenerator jwtTokenGenerator,
        TimeProvider? clock = null)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        // Age and licence rules count in Baku dates (BusinessCalendar).
        var phone = ValidateRegister(request, BusinessCalendar.Today(_clock).ToDateTime(TimeOnly.MinValue));

        // Normalise email so duplicate detection is case-insensitive.
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new ConflictException("A user with this email already exists.");
        }

        var now = _clock.GetUtcNow().UtcDateTime;

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FullName = request.FullName.Trim(),
            // Self-registration always creates a Client. Staff accounts must
            // be provisioned by an Admin (StaffAdminService).
            Role = UserRole.Client,
            CreatedAt = now
        };

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            Phone = phone,
            BirthDate = request.BirthDate.Date,
            DrivingLicenseDate = request.DrivingLicenseDate.Date,
            CreatedAt = now
        };

        _db.Users.Add(user);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(cancellationToken);

        var (token, expiresAt) = _jwtTokenGenerator.GenerateToken(user, customer.Id);
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

        // Same exception for unknown email, wrong password and a deactivated
        // account: nothing tells a caller which one it was.
        if (user is null || !user.IsActive || !_passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException();
        }

        // Clients always have a linked Customer; staff accounts usually don't.
        var customerId = await _db.Customers
            .Where(c => c.UserId == user.Id)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        var (token, expiresAt) = _jwtTokenGenerator.GenerateToken(user, customerId);
        return new AuthResponse(token, expiresAt, user.Email, user.FullName, user.Role);
    }

    public async Task<CurrentUserResponse> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new NotFoundException(nameof(User), userId);

        return new CurrentUserResponse(user.Id, user.Email, user.FullName, user.Role);
    }

    // Returns the phone in E.164 so storage is canonical whatever format the
    // client sent. Every failing field is reported at once (one 400, all errors).
    private static string ValidateRegister(RegisterRequest request, DateTime today)
    {
        var errors = new Dictionary<string, string[]>();
        void Check(string field, string? error)
        {
            if (error is not null) errors[field] = [error];
        }

        Check(nameof(request.Email), AuthValidation.EmailError(request.Email));
        Check(nameof(request.Password), AuthValidation.PasswordError(request.Password));
        Check(nameof(request.FullName), AuthValidation.FullNameError(request.FullName));

        var phone = AuthValidation.NormalizeAzerbaijaniPhone(request.Phone);
        Check(nameof(request.Phone), string.IsNullOrWhiteSpace(request.Phone)
            ? AuthValidation.Messages.PhoneRequired
            : phone is null ? AuthValidation.Messages.PhoneInvalid : null);

        var birthError = AuthValidation.BirthDateError(request.BirthDate, today);
        Check(nameof(request.BirthDate), birthError);
        // The licence rule is relative to the birth date; skip it while that is wrong.
        if (birthError is null)
        {
            Check(nameof(request.DrivingLicenseDate),
                AuthValidation.LicenceDateError(request.DrivingLicenseDate, request.BirthDate, today));
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
        return phone!;
    }
}
