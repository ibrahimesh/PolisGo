using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Cabinet.Dtos;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Cabinet;

public class CabinetService : ICabinetService
{
    // A reminder appears this many days before the last covered day.
    public const int ReminderWindowDays = 30;
    // A client has a handful of policies; the cap only bounds a pathological case.
    private const int MaxReminders = 50;
    private const int ActivityLimit = 8;

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _clock;

    public CabinetService(IApplicationDbContext db, ICurrentUser currentUser, TimeProvider? clock = null)
    {
        _db = db;
        _currentUser = currentUser;
        _clock = clock ?? TimeProvider.System;
    }

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;
    private DateOnly Today => DateOnly.FromDateTime(UtcNow);

    private Guid CustomerId => _currentUser.CustomerId
        ?? throw new UnauthorizedException("Client account has no linked customer profile.");

    public async Task<ClientOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken = default)
    {
        var customerId = CustomerId;
        var today = Today;
        var startOfToday = today.ToDateTime(TimeOnly.MinValue);

        var policies = _db.Policies.AsNoTracking().Where(p => p.CustomerId == customerId);
        var active = policies.WhereEffectiveStatus(PolicyStatus.Active, today);

        // A fixed set of small aggregate queries, each bounded to one customer.
        var activeCount = await active.CountAsync(cancellationToken);
        var insuredVehicles = await active.Select(p => p.VehicleId).Distinct().CountAsync(cancellationToken);
        var awaitingPayment = await policies
            .CountAsync(p => p.Status == PolicyStatus.Draft && p.StartDate >= startOfToday, cancellationToken);
        var vehicles = await _db.Vehicles.CountAsync(v => v.CustomerId == customerId, cancellationToken);

        var next = await active
            .OrderBy(p => p.EndDate).ThenBy(p => p.Id)
            .Select(p => new { p.Id, p.PolicyNumber, p.PolicyType.Code, p.EndDate })
            .FirstOrDefaultAsync(cancellationToken);

        var yearAgo = UtcNow.AddMonths(-12);
        var paid = await _db.Payments.AsNoTracking()
            .Where(pay => pay.Policy.CustomerId == customerId
                && pay.Status == PaymentStatus.Completed
                && pay.PaidAt >= yearAgo)
            .SumAsync(pay => (decimal?)pay.Amount, cancellationToken) ?? 0m;

        var reminders = await GetRemindersAsync(cancellationToken);

        var policyEvents = await _db.PolicyStatusHistory.AsNoTracking()
            .Where(h => h.Policy.CustomerId == customerId)
            .OrderByDescending(h => h.ChangedAt)
            .Take(ActivityLimit)
            .Select(h => new { h.PolicyId, h.Policy.PolicyNumber, h.FromStatus, h.ToStatus, h.ChangedAt })
            .ToListAsync(cancellationToken);

        var claimEvents = await _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.Claim.Policy.CustomerId == customerId)
            .OrderByDescending(h => h.ChangedAt)
            .Take(ActivityLimit)
            .Select(h => new { h.ClaimId, h.Claim.ClaimNumber, h.FromStatus, h.ToStatus, h.ChangedAt })
            .ToListAsync(cancellationToken);

        var activity = policyEvents
            .Select(e => new ActivityEntry(ActivityKind.Policy, e.PolicyId, e.PolicyNumber,
                e.FromStatus?.ToString(), e.ToStatus.ToString(), e.ChangedAt))
            .Concat(claimEvents.Select(e => new ActivityEntry(ActivityKind.Claim, e.ClaimId, e.ClaimNumber,
                e.FromStatus?.ToString(), e.ToStatus.ToString(), e.ChangedAt)))
            .OrderByDescending(e => e.At)
            .Take(ActivityLimit)
            .ToList();

        return new ClientOverviewResponse(
            ActivePolicies: activeCount,
            AwaitingPayment: awaitingPayment,
            NextRenewal: next is null
                ? null
                : new NextRenewalResponse(next.Id, next.PolicyNumber, next.Code,
                    DateOnly.FromDateTime(next.EndDate), DaysUntil(next.EndDate, today)),
            InsuredVehicles: insuredVehicles,
            Vehicles: vehicles,
            PaidLast12Months: paid,
            Currency: Tariff.Currency,
            UnreadReminders: reminders.Count(r => r.ReadAt is null),
            RecentActivity: activity);
    }

    public async Task<IReadOnlyList<ReminderResponse>> GetRemindersAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await Candidates(CustomerId, Today)
            .OrderBy(p => p.EndDate).ThenBy(p => p.Id)
            .Take(MaxReminders)
            .Select(p => new
            {
                p.Id,
                p.PolicyNumber,
                p.PolicyType.Code,
                p.EndDate,
                Vehicle = new PolicyVehicleSummary(p.VehicleId, p.Vehicle.Make, p.Vehicle.Model, p.Vehicle.Year, p.Vehicle.PlateNumber),
                ReadAt = _db.PolicyReminderReads
                    .Where(r => r.PolicyId == p.Id && r.UserId == _currentUser.UserId)
                    .Select(r => (DateTime?)r.ReadAt)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var today = Today;
        return rows
            .Select(r => new ReminderResponse(r.Id, r.PolicyNumber, r.Code, r.Vehicle,
                DateOnly.FromDateTime(r.EndDate), DaysUntil(r.EndDate, today), r.ReadAt))
            .ToList();
    }

    public async Task MarkReminderReadAsync(Guid policyId, CancellationToken cancellationToken = default)
    {
        // 404 for a policy the caller can't see, same as everywhere else.
        var visible = await PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser)
            .AnyAsync(p => p.Id == policyId, cancellationToken);
        if (!visible)
        {
            throw new NotFoundException(nameof(Policy), policyId);
        }

        await AddReadMarksAsync([policyId], cancellationToken);
    }

    public async Task MarkAllRemindersReadAsync(CancellationToken cancellationToken = default)
    {
        var ids = await Candidates(CustomerId, Today)
            .Select(p => p.Id)
            .Take(MaxReminders)
            .ToListAsync(cancellationToken);
        await AddReadMarksAsync(ids, cancellationToken);
    }

    // Active policies ending within the window that haven't been renewed: a
    // later policy of the same type for the same vehicle, Active or a Draft
    // that can still be paid, means the customer has already acted.
    private IQueryable<Policy> Candidates(Guid customerId, DateOnly today)
    {
        var startOfToday = today.ToDateTime(TimeOnly.MinValue);
        var horizon = today.AddDays(ReminderWindowDays).ToDateTime(TimeOnly.MinValue);

        return _db.Policies.AsNoTracking()
            .Where(p => p.CustomerId == customerId
                && p.Status == PolicyStatus.Active
                && p.EndDate >= startOfToday
                && p.EndDate <= horizon)
            .Where(p => !_db.Policies.Any(n =>
                n.VehicleId == p.VehicleId
                && n.PolicyTypeId == p.PolicyTypeId
                && n.StartDate > p.EndDate
                && (n.Status == PolicyStatus.Active
                    || (n.Status == PolicyStatus.Draft && n.StartDate >= startOfToday))));
    }

    // Idempotent: policies already marked keep their first ReadAt.
    private async Task AddReadMarksAsync(IReadOnlyCollection<Guid> policyIds, CancellationToken cancellationToken)
    {
        if (policyIds.Count == 0) return;

        var userId = _currentUser.UserId;
        var already = await _db.PolicyReminderReads
            .Where(r => r.UserId == userId && policyIds.Contains(r.PolicyId))
            .Select(r => r.PolicyId)
            .ToListAsync(cancellationToken);

        var now = UtcNow;
        foreach (var id in policyIds.Except(already))
        {
            _db.PolicyReminderReads.Add(new PolicyReminderRead
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                PolicyId = id,
                ReadAt = now
            });
        }
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static int DaysUntil(DateTime endDate, DateOnly today) =>
        DateOnly.FromDateTime(endDate).DayNumber - today.DayNumber;
}
