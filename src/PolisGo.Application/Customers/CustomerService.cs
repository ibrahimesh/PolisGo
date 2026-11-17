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

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;

    public CustomerService(IApplicationDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<PagedResult<CustomerListItem>> ListAsync(
        ListCustomersQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var customers = ApplySearch(_db.Customers.AsNoTracking(), query.Search);
        var totalCount = await customers.CountAsync(cancellationToken);

        // Counts are correlated subqueries in the same statement (no N+1),
        // filtered by the caller's usual policy/claim visibility.
        var visiblePolicies = PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser);
        var visibleClaims = ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser);

        var items = await ApplySort(customers, query.SortBy, query.SortDirection)
            .Skip((page - 1) * pageSize)
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
                visiblePolicies.Count(p => p.CustomerId == c.Id && p.Status == PolicyStatus.Active),
                visibleClaims.Count(cl => cl.Policy.CustomerId == c.Id)))
            .ToListAsync(cancellationToken);

        return new PagedResult<CustomerListItem>(items, page, pageSize, totalCount);
    }

    public async Task<CustomerDetailResponse> GetByIdAsync(
        Guid id, CancellationToken cancellationToken = default)
    {
        var customer = await _db.Customers.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), id);

        // One query per collection, each bounded to this customer.
        var vehicles = await _db.Vehicles.AsNoTracking()
            .Where(v => v.CustomerId == id)
            .OrderBy(v => v.PlateNumber)
            .ToListAsync(cancellationToken);

        var policies = await (
            from p in PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser)
            join pt in _db.PolicyTypes on p.PolicyTypeId equals pt.Id
            where p.CustomerId == id
            orderby p.CreatedAt descending
            select new { Policy = p, pt.Code })
            .ToListAsync(cancellationToken);

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

        var recent = await claims
            .OrderByDescending(c => c.CreatedAt)
            .Take(RecentClaimsLimit)
            .Select(c => new { Claim = c, c.Policy.PolicyNumber })
            .ToListAsync(cancellationToken);

        var summary = new CustomerClaimsSummary(
            Total: byStatus.Sum(s => s.Count),
            ByStatus: Enum.GetValues<ClaimStatus>()
                .Select(s => new StatusCount<ClaimStatus>(
                    s, byStatus.FirstOrDefault(b => b.Status == s)?.Count ?? 0))
                .ToList(),
            ClaimedAmount: byStatus.Sum(s => s.Claimed),
            PaidAmount: byStatus.Where(s => s.Status == ClaimStatus.Paid).Sum(s => s.Approved ?? 0m),
            Recent: recent.Select(r => ClaimService.Map(r.Claim, r.PolicyNumber)).ToList());

        return new CustomerDetailResponse(
            customer.Id,
            customer.FullName,
            customer.Email,
            customer.Phone,
            DateOnly.FromDateTime(customer.BirthDate),
            DateOnly.FromDateTime(customer.DrivingLicenseDate),
            customer.CreatedAt,
            customer.UserId != null,
            vehicles.Select(VehicleService.Map).ToList(),
            policies.Select(p => PolicyService.Map(p.Policy, p.Code)).ToList(),
            summary);
    }

    private static IQueryable<Customer> ApplySearch(IQueryable<Customer> customers, string? search)
    {
        var term = search?.Trim();
        if (string.IsNullOrEmpty(term)) return customers;

        if (term.Length > MaxSearchLength)
        {
            throw new ValidationException(
                "search", $"Search must be at most {MaxSearchLength} characters.");
        }

        // LIKE with escaped wildcards: user input can't inject % or _ patterns.
        // Case-insensitive on SQL Server's default collation.
        var pattern = $"%{EscapeLike(term)}%";
        var digits = new string(term.Where(char.IsAsciiDigit).ToArray());

        if (digits.Length < MinPhoneDigits)
        {
            return customers.Where(c =>
                EF.Functions.Like(c.FullName, pattern, LikeEscape)
                || EF.Functions.Like(c.Email, pattern, LikeEscape)
                || EF.Functions.Like(c.Phone, pattern, LikeEscape));
        }

        // Phones are stored as typed ("+994 50 123 45 67"); compare digits only
        // so "501234567" and "50-123-45-67" both match.
        var digitPattern = $"%{digits}%";
        return customers.Where(c =>
            EF.Functions.Like(c.FullName, pattern, LikeEscape)
            || EF.Functions.Like(c.Email, pattern, LikeEscape)
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
