using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Customers.Dtos;
using PolisGo.Application.Policies;
using PolisGo.Application.Vehicles;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Customers;

public class CustomerService : ICustomerService
{
    public const int MaxPageSize = 50;
    public const int MaxSearchLength = 100;
    public const int RecentClaimsLimit = 10;
    // Shorter digit runs would match almost every phone number.
    private const int MinPhoneDigits = 3;
    private const string LikeEscape = "\\";
    private const string PhoneSeparators = " +-()";

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _clock;

    public CustomerService(IApplicationDbContext db, ICurrentUser currentUser, TimeProvider? clock = null)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<PagedResult<CustomerListItem>> ListAsync(
        ListCustomersQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var customers = ApplySearch(
            CustomerAccess.VisibleTo(_db.Customers.AsNoTracking(), _currentUser), query.Search);
        // Within the caller's scope, so an agent filtering by another agent
        // still sees only their own book (here: nothing).
        if (query.Unassigned) customers = customers.Where(c => c.AgentId == null);
        else if (query.AgentId is { } agentId) customers = customers.Where(c => c.AgentId == agentId);
        var totalCount = await customers.CountAsync(cancellationToken);

        // Counts are correlated subqueries in the same statement (no N+1),
        // filtered by the caller's usual policy/claim visibility.
        var visiblePolicies = PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser);
        var visibleClaims = ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser);
        // Effective status: an Active policy past its end date is Expired.
        var startOfToday = BusinessCalendar.Today(_clock).ToDateTime(TimeOnly.MinValue);

        var items = await ApplySort(customers, query.SortBy, query.SortDirection)
            .Skip(Paging.Skip(page, pageSize))
            .Take(pageSize)
            .Select(c => new CustomerListItem(
                c.Id,
                c.FullName,
                c.Email,
                c.Phone,
                c.CreatedAt,
                c.UserId != null,
                c.Vehicles.Count(),
                visiblePolicies.Count(p => p.CustomerId == c.Id),
                visiblePolicies.Count(p => p.CustomerId == c.Id
                    && p.Status == PolicyStatus.Active && p.EndDate >= startOfToday),
                visibleClaims.Count(cl => cl.Policy.CustomerId == c.Id),
                c.AgentId,
                c.Agent != null ? c.Agent.FullName : null))
            .ToListAsync(cancellationToken);

        return new PagedResult<CustomerListItem>(items, page, pageSize, totalCount);
    }

    public async Task<CustomerDetailResponse> GetByIdAsync(
        Guid id, CancellationToken cancellationToken = default)
    {
        // Outside the caller's book is a 404, the same as no such customer.
        var row = await CustomerAccess.VisibleTo(_db.Customers.AsNoTracking(), _currentUser)
            .Where(c => c.Id == id)
            .Select(c => new { Customer = c, AgentName = c.Agent != null ? c.Agent.FullName : null })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), id);
        var customer = row.Customer;

        // One query per collection, each bounded to this customer.
        var vehicles = await _db.Vehicles.AsNoTracking()
            .Where(v => v.CustomerId == id)
            .OrderBy(v => v.PlateNumber)
            .ToListAsync(cancellationToken);

        var policies = await PolicyService.Project(
                PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser)
                    .Where(p => p.CustomerId == id)
                    .OrderByDescending(p => p.CreatedAt))
            .ToListAsync(cancellationToken);
        var today = BusinessCalendar.Today(_clock);

        var claims = ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser)
            .Where(c => c.Policy.CustomerId == id);

        var byStatus = await claims
            .GroupBy(c => c.Status)
            .Select(g => new
            {
                Status = g.Key,
                Count = g.Count(),
                Claimed = g.Sum(c => c.ClaimedAmount),
                Approved = g.Sum(c => c.ApprovedAmount)
            })
            .ToListAsync(cancellationToken);

        var recent = await ClaimService.Project(claims
                .OrderByDescending(c => c.CreatedAt).ThenBy(c => c.Id)
                .Take(RecentClaimsLimit))
            .ToListAsync(cancellationToken);

        var summary = new CustomerClaimsSummary(
            Total: byStatus.Sum(s => s.Count),
            ByStatus: Enum.GetValues<ClaimStatus>()
                .Select(s => new StatusCount<ClaimStatus>(
                    s, byStatus.FirstOrDefault(b => b.Status == s)?.Count ?? 0))
                .ToList(),
            ClaimedAmount: byStatus.Sum(s => s.Claimed),
            PaidAmount: byStatus.Where(s => s.Status == ClaimStatus.Paid).Sum(s => s.Approved ?? 0m),
            Recent: recent);

        return new CustomerDetailResponse(
            customer.Id,
            customer.FullName,
            customer.Email,
            customer.Phone,
            DateOnly.FromDateTime(customer.BirthDate),
            DateOnly.FromDateTime(customer.DrivingLicenseDate),
            customer.CreatedAt,
            customer.UserId != null,
            customer.AgentId,
            row.AgentName,
            vehicles.Select(VehicleService.Map).ToList(),
            policies.Select(p => p.ToResponse(today)).ToList(),
            summary);
    }

    public async Task AssignAgentAsync(
        Guid customerId, AssignAgentRequest request, CancellationToken cancellationToken = default)
    {
        var customer = await _db.Customers.Include(c => c.Agent)
                .FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), customerId);

        // Only an active agent can take on a book.
        string? agentName = null;
        if (request.AgentId is { } agentId)
        {
            agentName = await _db.Users
                .Where(u => u.Id == agentId && u.Role == UserRole.Agent && u.IsActive)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new ValidationException("agentId", AgentNotFound);
        }

        if (customer.AgentId == request.AgentId) return;

        _db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(),
            OccurredAt = _clock.GetUtcNow().UtcDateTime,
            ActorUserId = _currentUser.UserId,
            Action = AuditAction.CustomerAssigned,
            SubjectId = customer.Id,
            SubjectLabel = customer.FullName,
            FromValue = customer.Agent?.FullName,
            ToValue = agentName
        });
        customer.AgentId = request.AgentId;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public const string AgentNotFound = "No active agent with this id.";

    private static IQueryable<Customer> ApplySearch(IQueryable<Customer> customers, string? search)
    {
        var term = search?.Trim();
        if (string.IsNullOrEmpty(term)) return customers;

        if (term.Length > MaxSearchLength)
        {
            throw new ValidationException(
                "search", $"Search must be at most {MaxSearchLength} characters.");
        }

        // Name and email through the folded key (SearchText): SQL Server's
        // collation and SQLite's LIKE disagree on İ/ı, ə and Cyrillic case.
        // Contains takes the text literally: % and _ are not patterns.
        var needle = SearchText.Fold(term);
        // Phones are digits and separators: LIKE with escaped wildcards.
        var pattern = $"%{EscapeLike(term)}%";
        var digits = new string(term.Where(char.IsAsciiDigit).ToArray());

        // Digits are compared as a phone only when the term is written like
        // one. An email or a name with digits in it ("e2e.k3o4@...") would
        // otherwise match every phone that happens to contain them.
        var looksLikePhone = term.All(c => char.IsAsciiDigit(c) || PhoneSeparators.Contains(c));
        if (!looksLikePhone || digits.Length < MinPhoneDigits)
        {
            return customers.Where(c =>
                EF.Property<string>(c, SearchText.KeyProperty).Contains(needle)
                || EF.Functions.Like(c.Phone, pattern, LikeEscape));
        }

        // Phones are stored as typed ("+994 50 123 45 67"); compare digits only
        // so "501234567" and "50-123-45-67" both match.
        var digitPattern = $"%{digits}%";
        return customers.Where(c =>
            EF.Property<string>(c, SearchText.KeyProperty).Contains(needle)
            || EF.Functions.Like(
                c.Phone.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "").Replace("+", ""),
                digitPattern));
    }

    private static string EscapeLike(string value) => value
        .Replace(LikeEscape, LikeEscape + LikeEscape)
        .Replace("%", LikeEscape + "%")
        .Replace("_", LikeEscape + "_")
        .Replace("[", LikeEscape + "[");

    // Id as the final tie-breaker keeps paging stable when sort keys collide.
    private static IQueryable<Customer> ApplySort(
        IQueryable<Customer> customers, CustomerSortBy sortBy, SortDirection direction) =>
        (sortBy, direction) switch
        {
            (CustomerSortBy.FullName, SortDirection.Asc) => customers.OrderBy(c => c.FullName).ThenBy(c => c.Id),
            (CustomerSortBy.FullName, SortDirection.Desc) => customers.OrderByDescending(c => c.FullName).ThenBy(c => c.Id),
            (CustomerSortBy.Email, SortDirection.Asc) => customers.OrderBy(c => c.Email).ThenBy(c => c.Id),
            (CustomerSortBy.Email, SortDirection.Desc) => customers.OrderByDescending(c => c.Email).ThenBy(c => c.Id),
            (_, SortDirection.Asc) => customers.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id),
            _ => customers.OrderByDescending(c => c.CreatedAt).ThenBy(c => c.Id)
        };
}
