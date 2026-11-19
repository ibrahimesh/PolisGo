using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Pricing;
using PolisGo.Application.Statistics.Dtos;
using PolisGo.Application.Common;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Statistics;

// Every figure is an aggregate computed by the database (COUNT/SUM/AVG with
// GROUP BY); no entity rows are materialised. Results are identical for all
// admins, so one snapshot is cached briefly and shared.
public class AdminStatsService : IAdminStatsService
{
    public const int MonthsOfHistory = 12;
    public static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);
    private const string CacheKey = "admin-stats";

    private readonly IApplicationDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly TimeProvider _clock;

    public AdminStatsService(IApplicationDbContext db, IMemoryCache cache, TimeProvider clock)
    {
        _db = db;
        _cache = cache;
        _clock = clock;
    }

    public async Task<AdminStatsResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;

        // Freshness is judged against the injected clock (not the cache's own),
        // so the TTL is deterministic in tests.
        if (_cache.TryGetValue(CacheKey, out AdminStatsResponse? cached)
            && cached is not null
            && now - cached.GeneratedAt < CacheTtl)
        {
            return cached;
        }

        var snapshot = await ComputeAsync(now, cancellationToken);
        _cache.Set(CacheKey, snapshot, CacheTtl);
        return snapshot;
    }

    private async Task<AdminStatsResponse> ComputeAsync(DateTime now, CancellationToken ct)
    {
        var policiesByStatus = await _db.Policies.AsNoTracking()
            .GroupBy(p => p.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        var premiumWritten = await _db.Payments.AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Completed)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

        var claimsByStatus = await _db.Claims.AsNoTracking()
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);

        var paidAmount = await _db.Claims.AsNoTracking()
            .Where(c => c.Status == ClaimStatus.Paid)
            .SumAsync(c => c.ApprovedAmount, ct) ?? 0m;

        var totalCustomers = await _db.Customers.CountAsync(ct);

        var (resolvedCount, averageHours) = await ResolutionAsync(ct);
        var monthly = await MonthlyAsync(now, ct);

        return new AdminStatsResponse(
            GeneratedAt: now,
            Currency: Tariff.Currency,
            TotalCustomers: totalCustomers,
            Policies: new PolicyStats(
                Total: policiesByStatus.Values.Sum(),
                ByStatus: ZeroFilled(policiesByStatus),
                PremiumWritten: premiumWritten),
            Claims: new ClaimStats(
                Total: claimsByStatus.Values.Sum(),
                ByStatus: ZeroFilled(claimsByStatus),
                PaidAmount: paidAmount,
                ResolvedCount: resolvedCount,
                AverageResolutionHours: averageHours),
            Monthly: monthly);
    }

    // A claim is resolved at its first transition to Approved or Rejected
    // (the adjuster's decision; payout timing is a separate concern).
    private async Task<(int Count, double? AverageHours)> ResolutionAsync(CancellationToken ct)
    {
        var decisions = _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.ToStatus == ClaimStatus.Approved || h.ToStatus == ClaimStatus.Rejected)
            .GroupBy(h => h.ClaimId)
            .Select(g => new { ClaimId = g.Key, DecidedAt = g.Min(h => h.ChangedAt) });

        var count = await decisions.CountAsync(ct);
        if (count == 0) return (0, null);

        // Portable DATEDIFF: mean(decided - submitted) = mean(decided) - mean(submitted)
        // over the same claims, and each side is an exact minute number built
        // from date parts that both SQL Server and SQLite translate.
        var meanDecided = await decisions
            .Select(d => d.DecidedAt)
            .Select(MinuteNumber)
            .AverageAsync(ct);
        var meanSubmitted = await _db.Claims.AsNoTracking()
            .Where(c => decisions.Any(d => d.ClaimId == c.Id))
            .Select(c => c.CreatedAt)
            .Select(MinuteNumber)
            .AverageAsync(ct);

        return (count, Math.Round((meanDecided - meanSubmitted) / 60d, 2));
    }

    // Minutes since 0001-01-01 (proleptic Gregorian), computed in SQL. Exact
    // to the minute; int arithmetic stays well below overflow until year ~4000.
    internal static readonly Expression<Func<DateTime, double>> MinuteNumber = d =>
        (double)((((d.Year - 1) * 365 + (d.Year - 1) / 4 - (d.Year - 1) / 100 + (d.Year - 1) / 400
                   + d.DayOfYear) * 1440)
                 + d.Hour * 60 + d.Minute);

    private async Task<IReadOnlyList<MonthlyActivity>> MonthlyAsync(DateTime now, CancellationToken ct)
    {
        var currentMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var windowStart = currentMonth.AddMonths(-(MonthsOfHistory - 1));

        var policies = await _db.Policies.AsNoTracking()
            .Where(p => p.CreatedAt >= windowStart)
            .GroupBy(p => new { p.CreatedAt.Year, p.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync(ct);

        var claims = await _db.Claims.AsNoTracking()
            .Where(c => c.CreatedAt >= windowStart)
            .GroupBy(c => new { c.CreatedAt.Year, c.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync(ct);

        // At most 12 grouped rows per side: zero-fill the gaps in memory.
        return Enumerable.Range(0, MonthsOfHistory)
            .Select(i => windowStart.AddMonths(i))
            .Select(m => new MonthlyActivity(
                m.Year,
                m.Month,
                policies.FirstOrDefault(p => p.Year == m.Year && p.Month == m.Month)?.Count ?? 0,
                claims.FirstOrDefault(c => c.Year == m.Year && c.Month == m.Month)?.Count ?? 0))
            .ToList();
    }

    private static IReadOnlyList<StatusCount<TStatus>> ZeroFilled<TStatus>(
        IReadOnlyDictionary<TStatus, int> counts) where TStatus : struct, Enum =>
        Enum.GetValues<TStatus>()
            .Select(s => new StatusCount<TStatus>(s, counts.GetValueOrDefault(s)))
            .ToList();
}
