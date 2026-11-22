using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims;
using PolisGo.Application.Common;
using PolisGo.Application.Customers;
using PolisGo.Application.Policies;
using PolisGo.Application.Pricing;
using PolisGo.Application.Staff.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Staff;

public interface IStaffOverviewService
{
    Task<StaffOverviewResponse> GetAsync(CancellationToken cancellationToken = default);
}

// The staff home page. Every figure is a database aggregate over the rows the
// caller may see, through the same access rules as the lists they link to, so
// a count and the list behind it always agree. Per user, so not cached.
public class StaffOverviewService : IStaffOverviewService
{
    public const int RecentLimit = 5;
    public const int WindowDays = 30;

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _clock;

    public StaffOverviewService(IApplicationDbContext db, ICurrentUser currentUser, TimeProvider clock)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<StaffOverviewResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var role = _currentUser.Role;

        var claims = role is UserRole.Adjuster or UserRole.Admin
            ? await ClaimsDeskAsync(now, cancellationToken)
            : null;
        var sales = role is UserRole.Agent or UserRole.Admin
            ? await SalesAsync(now, cancellationToken)
            : null;

        return new StaffOverviewResponse(now, Tariff.Currency, claims, sales);
    }

    private async Task<ClaimsDeskSummary> ClaimsDeskAsync(DateTime now, CancellationToken ct)
    {
        var visible = ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser);

        var byStatus = await visible
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);
        int Count(ClaimStatus status) => byStatus.GetValueOrDefault(status);

        var oldestWaiting = await visible
            .Where(c => c.Status == ClaimStatus.Submitted)
            .MinAsync(c => (DateTime?)c.CreatedAt, ct);

        // Decisions are history rows; the claim itself may have moved on
        // (Approved -> Paid) since.
        var since = now.AddDays(-WindowDays);
        var decisions = _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.ToStatus == ClaimStatus.Approved || h.ToStatus == ClaimStatus.Rejected)
            .Where(h => visible.Any(c => c.Id == h.ClaimId));
        if (_currentUser.Role != UserRole.Admin)
        {
            decisions = decisions.Where(h => h.ChangedByUserId == _currentUser.UserId);
        }

        var decidedRecently = await decisions.CountAsync(h => h.ChangedAt >= since, ct);
        var recent = await decisions
            .OrderByDescending(h => h.ChangedAt).ThenBy(h => h.Id)
            .Take(RecentLimit)
            .Select(h => new RecentDecision(
                h.ClaimId,
                h.Claim.ClaimNumber,
                h.Claim.Policy.Customer.FullName,
                h.ToStatus,
                h.Claim.ClaimedAmount,
                h.Claim.ApprovedAmount,
                h.ChangedByUser.FullName,
                h.ChangedAt))
            .ToListAsync(ct);

        return new ClaimsDeskSummary(
            WaitingForReview: Count(ClaimStatus.Submitted),
            OldestWaitingSince: oldestWaiting,
            InReview: Count(ClaimStatus.UnderReview),
            AwaitingPayment: Count(ClaimStatus.Approved),
            DecidedLast30Days: decidedRecently,
            RecentDecisions: recent);
    }

    private async Task<SalesSummary> SalesAsync(DateTime now, CancellationToken ct)
    {
        var today = BusinessCalendar.Today(_clock);
        var since = now.AddDays(-WindowDays);
        // Sales are what the caller sold (an Admin: everything), not every
        // policy they can read: an agent also reads their book's other cover.
        var policies = PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser);
        if (_currentUser.Role == UserRole.Agent)
        {
            policies = policies.Where(p => p.AgentId == _currentUser.UserId);
        }

        var customers = await CustomerAccess.VisibleTo(_db.Customers.AsNoTracking(), _currentUser)
            .CountAsync(ct);

        // Effective statuses (an Active policy past its end is Expired): one
        // count each through the shared filter rather than a stored GROUP BY.
        var byStatus = new List<StatusCount<PolicyStatus>>();
        foreach (var status in Enum.GetValues<PolicyStatus>())
        {
            byStatus.Add(new StatusCount<PolicyStatus>(
                status, await policies.WhereEffectiveStatus(status, today).CountAsync(ct)));
        }

        var payments = _db.Payments.AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Completed)
            .Where(p => policies.Any(pol => pol.Id == p.PolicyId));
        var written = await payments.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var recentPayments = payments.Where(p => p.PaidAt >= since);
        var writtenRecently = await recentPayments.SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var soldRecently = await recentPayments.Select(p => p.PolicyId).Distinct().CountAsync(ct);

        var openClaims = await ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser)
            .Where(c => policies.Any(p => p.Id == c.PolicyId))
            .CountAsync(c => c.Status == ClaimStatus.Submitted || c.Status == ClaimStatus.UnderReview, ct);

        var recent = (await PolicyService.Project(policies
                    .OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id)
                    .Take(RecentLimit))
                .ToListAsync(ct))
            .Select(r => r.ToResponse(today))
            .ToList();

        return new SalesSummary(customers, byStatus, written, writtenRecently, soldRecently, openClaims, recent);
    }
}
