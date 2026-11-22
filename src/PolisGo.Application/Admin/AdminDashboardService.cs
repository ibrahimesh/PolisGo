using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Pricing;
using PolisGo.Application.Statistics;
using PolisGo.Domain.Enums;
using M = PolisGo.Application.Admin.AdminValidation.Messages;

namespace PolisGo.Application.Admin;

public interface IAdminDashboardService
{
    Task<AdminDashboardResponse> GetAsync(DateOnly? from, DateOnly? to, CancellationToken cancellationToken = default);
}

// The admin dashboard for a date range (inclusive days, UTC). Every figure is
// a database aggregate; months are grouped by Year/Month parts, which both
// providers translate. One snapshot per range is cached briefly and shared by
// all admins, like /api/admin/stats.
public class AdminDashboardService : IAdminDashboardService
{
    public const int DefaultMonths = 12;
    public const int TopAgentCount = 5;
    public static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    private readonly IApplicationDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly TimeProvider _clock;

    public AdminDashboardService(IApplicationDbContext db, IMemoryCache cache, TimeProvider clock)
    {
        _db = db;
        _cache = cache;
        _clock = clock;
    }

    public async Task<AdminDashboardResponse> GetAsync(
        DateOnly? from, DateOnly? to, CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        // The default period ends on today's business date (Baku); the
        // figures themselves are grouped by their UTC timestamps.
        var today = BusinessCalendar.Today(_clock);
        var end = to ?? today;
        // Default: the last twelve calendar months, this one included.
        var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-(DefaultMonths - 1));

        if (start > end) throw new ValidationException("from", M.RangeOrder);
        if (start < end.AddMonths(-AdminValidation.MaxRangeMonths)) throw new ValidationException("from", M.RangeTooLong);

        var key = $"admin-dashboard:{start:yyyy-MM-dd}:{end:yyyy-MM-dd}";
        if (_cache.TryGetValue(key, out AdminDashboardResponse? cached) && cached is not null
            && now - cached.GeneratedAt < CacheTtl)
        {
            return cached;
        }

        var snapshot = await ComputeAsync(start, end, now, cancellationToken);
        _cache.Set(key, snapshot, CacheTtl);
        return snapshot;
    }

    private async Task<AdminDashboardResponse> ComputeAsync(
        DateOnly start, DateOnly end, DateTime now, CancellationToken ct)
    {
        var from = start.ToDateTime(TimeOnly.MinValue);
        var before = end.AddDays(1).ToDateTime(TimeOnly.MinValue);

        var policies = _db.Policies.AsNoTracking().Where(p => p.CreatedAt >= from && p.CreatedAt < before);
        var payments = _db.Payments.AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Completed && p.PaidAt >= from && p.PaidAt < before);
        var claims = _db.Claims.AsNoTracking().Where(c => c.CreatedAt >= from && c.CreatedAt < before);

        var policiesByMonth = await policies
            .GroupBy(p => new { p.CreatedAt.Year, p.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync(ct);
        var premiumByMonth = await payments
            .GroupBy(p => new { p.PaidAt.Year, p.PaidAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Sum = g.Sum(p => p.Amount) })
            .ToListAsync(ct);
        var claimsByMonth = await claims
            .GroupBy(c => new { c.CreatedAt.Year, c.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync(ct);

        var byStatus = await claims
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        // A claim is decided at its first Approved or Rejected; it counts in
        // the range that decision falls in.
        var decisions = _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.ToStatus == ClaimStatus.Approved || h.ToStatus == ClaimStatus.Rejected)
            .GroupBy(h => h.ClaimId)
            .Select(g => new { ClaimId = g.Key, DecidedAt = g.Min(h => h.ChangedAt) })
            .Where(d => d.DecidedAt >= from && d.DecidedAt < before);
        var decided = await decisions.CountAsync(ct);
        double? averageHours = null;
        if (decided > 0)
        {
            var meanDecided = await decisions.Select(d => d.DecidedAt).Select(AdminStatsService.MinuteNumber).AverageAsync(ct);
            var meanFiled = await _db.Claims.AsNoTracking()
                .Where(c => decisions.Any(d => d.ClaimId == c.Id))
                .Select(c => c.CreatedAt).Select(AdminStatsService.MinuteNumber).AverageAsync(ct);
            averageHours = Math.Round((meanDecided - meanFiled) / 60d, 2);
        }

        var paidOut = await _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.ToStatus == ClaimStatus.Paid && h.ChangedAt >= from && h.ChangedAt < before)
            .SumAsync(h => h.Claim.ApprovedAmount, ct) ?? 0m;

        var agentSales = await payments
            .Where(p => p.Policy.AgentId != null)
            .GroupBy(p => p.Policy.AgentId)
            .Select(g => new
            {
                AgentId = g.Key,
                Premium = g.Sum(p => p.Amount),
                Policies = g.Select(p => p.PolicyId).Distinct().Count()
            })
            .OrderByDescending(a => a.Premium)
            .Take(TopAgentCount)
            .ToListAsync(ct);
        var agentIds = agentSales.Select(a => a.AgentId!.Value).ToList();
        var agents = await _db.Users.AsNoTracking()
            .Where(u => agentIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.IsActive })
            .ToDictionaryAsync(u => u.Id, ct);

        var months = new List<DashboardMonth>();
        for (var m = new DateOnly(start.Year, start.Month, 1); m <= end; m = m.AddMonths(1))
        {
            months.Add(new DashboardMonth(
                m.Year, m.Month,
                policiesByMonth.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Count ?? 0,
                premiumByMonth.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Sum ?? 0m,
                claimsByMonth.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Count ?? 0));
        }

        return new AdminDashboardResponse(
            start, end, now, Tariff.Currency,
            new DashboardTotals(
                PoliciesIssued: months.Sum(m => m.PoliciesIssued),
                PremiumWritten: months.Sum(m => m.PremiumWritten),
                ClaimsFiled: months.Sum(m => m.ClaimsFiled),
                ClaimsDecided: decided,
                AverageResolutionHours: averageHours,
                ClaimsPaidAmount: paidOut),
            months,
            Enum.GetValues<ClaimStatus>().Select(s => new StatusCount<ClaimStatus>(s, byStatus.GetValueOrDefault(s))).ToList(),
            agentSales.Select(a => new TopAgent(
                a.AgentId!.Value,
                agents.TryGetValue(a.AgentId.Value, out var agent) ? agent.FullName : "",
                agent?.IsActive ?? false,
                a.Policies,
                a.Premium)).ToList());
    }
}
