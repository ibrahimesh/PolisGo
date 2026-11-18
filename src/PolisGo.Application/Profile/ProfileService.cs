using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Auth;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Profile.Dtos;
using PolisGo.Domain.Entities;

namespace PolisGo.Application.Profile;

public class ProfileService : IProfileService
{
    private readonly IApplicationDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ICurrentUser _currentUser;

    public ProfileService(IApplicationDbContext db, IPasswordHasher passwordHasher, ICurrentUser currentUser)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _currentUser = currentUser;
    }

    public async Task<ProfileResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var (user, customer) = await LoadAsync(tracked: false, cancellationToken);
        return Map(user, customer);
    }

    public async Task<ProfileResponse> UpdateAsync(
        UpdateProfileRequest request, CancellationToken cancellationToken = default)
    {
        var (user, customer) = await LoadAsync(tracked: true, cancellationToken);

        // Same rules and messages as registration, every failing field at once.
        var errors = new Dictionary<string, string[]>();
        if (AuthValidation.FullNameError(request.FullName) is { } nameError)
        {
            errors[nameof(request.FullName)] = [nameError];
        }

        string? phone = null;
        if (customer is not null)
        {
            phone = AuthValidation.NormalizeAzerbaijaniPhone(request.Phone);
            if (string.IsNullOrWhiteSpace(request.Phone))
                errors[nameof(request.Phone)] = [AuthValidation.Messages.PhoneRequired];
            else if (phone is null)
                errors[nameof(request.Phone)] = [AuthValidation.Messages.PhoneInvalid];
        }
        else if (!string.IsNullOrWhiteSpace(request.Phone))
        {
            errors[nameof(request.Phone)] = [AuthValidation.Messages.PhoneNotApplicable];
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        var fullName = request.FullName.Trim();
        user.FullName = fullName;
        if (customer is not null)
        {
            // The customer record keeps its own copy of the name (walk-in
            // customers have no user), so keep both in step.
            customer.FullName = fullName;
            customer.Phone = phone!;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Map(user, customer);
    }

    public async Task ChangePasswordAsync(
        ChangePasswordRequest request, CancellationToken cancellationToken = default)
    {
        var (user, _) = await LoadAsync(tracked: true, cancellationToken);

        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrEmpty(request.CurrentPassword))
        {
            errors[nameof(request.CurrentPassword)] = [AuthValidation.Messages.CurrentPasswordRequired];
        }
        else if (!_passwordHasher.Verify(request.CurrentPassword, user.PasswordHash))
        {
            // A field error (400), not a 401: the caller is authenticated, and
            // clients treat 401 as an expired session and sign the user out.
            errors[nameof(request.CurrentPassword)] = [AuthValidation.Messages.CurrentPasswordIncorrect];
        }

        if (AuthValidation.PasswordError(request.NewPassword) is { } passwordError)
        {
            errors[nameof(request.NewPassword)] = [passwordError];
        }
        else if (request.NewPassword == request.CurrentPassword)
        {
            errors[nameof(request.NewPassword)] = [AuthValidation.Messages.PasswordUnchanged];
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }

        user.PasswordHash = _passwordHasher.Hash(request.NewPassword);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<(User User, Customer? Customer)> LoadAsync(bool tracked, CancellationToken cancellationToken)
    {
        IQueryable<User> users = tracked ? _db.Users : _db.Users.AsNoTracking();
        IQueryable<Customer> customers = tracked ? _db.Customers : _db.Customers.AsNoTracking();

        var user = await users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId, cancellationToken)
            ?? throw new NotFoundException(nameof(User), _currentUser.UserId);
        var customer = await customers.FirstOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);
        return (user, customer);
    }

    private static ProfileResponse Map(User user, Customer? customer) => new(
        Id: user.Id,
        Email: user.Email,
        FullName: user.FullName,
        Role: user.Role,
        Phone: customer?.Phone,
        BirthDate: customer is null ? null : DateOnly.FromDateTime(customer.BirthDate),
        DrivingLicenseDate: customer is null ? null : DateOnly.FromDateTime(customer.DrivingLicenseDate),
        CreatedAt: user.CreatedAt);
}
