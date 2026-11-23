using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Auth;
using PolisGo.Application.Auth.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using M = PolisGo.Application.Admin.AdminValidation.Messages;

namespace PolisGo.Application.Admin;

public interface IStaffAdminService
{
    Task<PagedResult<StaffMemberResponse>> ListAsync(ListStaffQuery query, CancellationToken cancellationToken = default);
    Task<StaffMemberResponse> CreateAsync(CreateStaffUserRequest request, CancellationToken cancellationToken = default);
    Task<StaffMemberResponse> DeactivateAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<StaffMemberResponse> ReactivateAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<StaffMemberResponse> ChangeRoleAsync(Guid userId, ChangeRoleRequest request, CancellationToken cancellationToken = default);
}

// Staff accounts for admins. Every change is written with its AuditEntry in
// one SaveChanges, and the account rules (never yourself, never the last
// active admin) are checked here, before the entity is touched.
public class StaffAdminService : IStaffAdminService
{
    private const int MaxPageSize = 50;
    private static readonly UserRole[] StaffRoles = [UserRole.Agent, UserRole.Adjuster, UserRole.Admin];

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IPasswordHasher _passwordHasher;
    private readonly TimeProvider _clock;

    public StaffAdminService(
        IApplicationDbContext db, ICurrentUser currentUser, IPasswordHasher passwordHasher, TimeProvider clock)
    {
        _db = db;
        _currentUser = currentUser;
        _passwordHasher = passwordHasher;
        _clock = clock;
    }

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;

    public async Task<PagedResult<StaffMemberResponse>> ListAsync(
        ListStaffQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var staff = _db.Users.AsNoTracking().Where(u => StaffRoles.Contains(u.Role));
        if (query.Role is { } role)
        {
            if (!StaffRoles.Contains(role)) throw new ValidationException("role", M.RoleInvalid);
            staff = staff.Where(u => u.Role == role);
        }
        staff = query.Status switch
        {
            StaffStatusFilter.Active => staff.Where(u => u.IsActive),
            StaffStatusFilter.Inactive => staff.Where(u => !u.IsActive),
            _ => staff
        };

        var term = query.Search?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            if (term.Length > AdminValidation.MaxSearchLength) throw new ValidationException("search", M.SearchTooLong);
            var needle = term.ToUpperInvariant();
            staff = staff.Where(u => u.FullName.ToUpper().Contains(needle) || u.Email.ToUpper().Contains(needle));
        }

        var total = await staff.CountAsync(cancellationToken);
        var items = await Project(staff.OrderBy(u => u.FullName).ThenBy(u => u.Id)
                .Skip(Paging.Skip(page, pageSize)).Take(pageSize))
            .ToListAsync(cancellationToken);
        return new PagedResult<StaffMemberResponse>(items, page, pageSize, total);
    }

    public async Task<StaffMemberResponse> CreateAsync(
        CreateStaffUserRequest request, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        void Check(string field, string? error)
        {
            if (error is not null) errors[field] = [error];
        }
        Check(nameof(request.Email), AuthValidation.EmailError(request.Email));
        Check(nameof(request.Password), AuthValidation.PasswordError(request.Password));
        Check(nameof(request.FullName), AuthValidation.FullNameError(request.FullName));
        if (!StaffRoles.Contains(request.Role)) errors[nameof(request.Role)] = [M.RoleInvalid];
        if (errors.Count > 0) throw new ValidationException(errors);

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
            CreatedAt = UtcNow
        };
        _db.Users.Add(user);
        Record(AuditAction.StaffCreated, user, null, user.Role.ToString());
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(user.Id, cancellationToken);
    }

    public async Task<StaffMemberResponse> DeactivateAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        // The last-admin check and the write hold together: two admins
        // retiring each other at once can't both pass the check.
        await using var transaction = await _db.BeginSerializableTransactionAsync(cancellationToken);
        var user = await LoadStaffAsync(userId, cancellationToken);
        if (!user.IsActive) throw new ConflictException(M.AlreadyInactive);
        // The caller is an active admin, so this can only bite when the only
        // admin acts on their own account; it says more than "not yourself".
        if (user.Role == UserRole.Admin) await EnsureAnotherActiveAdminAsync(user.Id, cancellationToken);
        EnsureNotSelf(user);

        user.Deactivate(UtcNow);
        Record(AuditAction.StaffDeactivated, user, null, null);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await ProjectOneAsync(user.Id, cancellationToken);
    }

    public async Task<StaffMemberResponse> ReactivateAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await LoadStaffAsync(userId, cancellationToken);
        if (user.IsActive) throw new ConflictException(M.AlreadyActive);

        user.Reactivate();
        Record(AuditAction.StaffReactivated, user, null, null);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(user.Id, cancellationToken);
    }

    public async Task<StaffMemberResponse> ChangeRoleAsync(
        Guid userId, ChangeRoleRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Role is not { } role || !StaffRoles.Contains(role))
        {
            throw new ValidationException("role", M.RoleInvalid);
        }

        await using var transaction = await _db.BeginSerializableTransactionAsync(cancellationToken);
        var user = await LoadStaffAsync(userId, cancellationToken);
        if (user.Role == role) throw new ConflictException(M.SameRole);
        if (user.Role == UserRole.Admin && user.IsActive) await EnsureAnotherActiveAdminAsync(user.Id, cancellationToken);
        EnsureNotSelf(user);

        var from = user.Role;
        user.ChangeRole(role);
        Record(AuditAction.RoleChanged, user, from.ToString(), role.ToString());

        // A former agent no longer works a book: their customers go back to
        // unassigned (each release recorded), for an admin to hand on.
        if (from == UserRole.Agent)
        {
            var customers = await _db.Customers.Where(c => c.AgentId == user.Id).ToListAsync(cancellationToken);
            foreach (var customer in customers)
            {
                customer.AgentId = null;
                _db.AuditEntries.Add(new AuditEntry
                {
                    Id = Guid.NewGuid(),
                    OccurredAt = UtcNow,
                    ActorUserId = _currentUser.UserId,
                    Action = AuditAction.CustomerAssigned,
                    SubjectId = customer.Id,
                    SubjectLabel = customer.FullName,
                    FromValue = user.FullName,
                    ToValue = null
                });
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await ProjectOneAsync(user.Id, cancellationToken);
    }

    private async Task<User> LoadStaffAsync(Guid userId, CancellationToken cancellationToken)
    {
        // A client account is not staff: 404, as for an unknown id.
        return await _db.Users.FirstOrDefaultAsync(
                   u => u.Id == userId && StaffRoles.Contains(u.Role), cancellationToken)
               ?? throw new NotFoundException(nameof(User), userId);
    }

    private void EnsureNotSelf(User user)
    {
        if (user.Id == _currentUser.UserId) throw new ConflictException(M.NotYourself);
    }

    private async Task EnsureAnotherActiveAdminAsync(Guid exceptId, CancellationToken cancellationToken)
    {
        var others = await _db.Users.AnyAsync(
            u => u.Role == UserRole.Admin && u.IsActive && u.Id != exceptId, cancellationToken);
        if (!others) throw new ConflictException(M.LastAdmin);
    }

    private void Record(AuditAction action, User subject, string? from, string? to) =>
        _db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(),
            OccurredAt = UtcNow,
            ActorUserId = _currentUser.UserId,
            Action = action,
            SubjectId = subject.Id,
            SubjectLabel = subject.Email,
            FromValue = from,
            ToValue = to
        });

    private Task<StaffMemberResponse> ProjectOneAsync(Guid id, CancellationToken cancellationToken) =>
        Project(_db.Users.AsNoTracking().Where(u => u.Id == id)).FirstAsync(cancellationToken);

    private IQueryable<StaffMemberResponse> Project(IQueryable<User> users) =>
        users.Select(u => new StaffMemberResponse(
            u.Id,
            u.Email,
            u.FullName,
            u.Role,
            u.IsActive,
            u.CreatedAt,
            u.DeactivatedAt,
            _db.Customers.Count(c => c.AgentId == u.Id),
            _db.Claims.Count(c => c.AssignedAdjusterId == u.Id
                && (c.Status == ClaimStatus.UnderReview || c.Status == ClaimStatus.Approved))));
}
