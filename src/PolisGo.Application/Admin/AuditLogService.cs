using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Admin.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Enums;
using M = PolisGo.Application.Admin.AdminValidation.Messages;

namespace PolisGo.Application.Admin;

public interface IAuditLogService
{
    Task<PagedResult<AuditEventResponse>> ListAsync(AuditLogQuery query, CancellationToken cancellationToken = default);
}

// One feed over what is actually recorded: claim status history, policy
// status history and staff actions. Each source is filtered and ordered in
// SQL and read up to the end of the requested page; the newest-first merge
// and the page slice happen in memory. That keeps it a fixed number of
// portable queries (no provider-specific UNION of enum conversions), at the
// cost of reading page × size rows per source on deep pages.
public class AuditLogService : IAuditLogService
{
    private const int MaxPageSize = 50;
    public const int MaxPage = 200;
    public const string StatusChanged = "StatusChanged";

    private readonly IApplicationDbContext _db;

    public AuditLogService(IApplicationDbContext db) => _db = db;

    public async Task<PagedResult<AuditEventResponse>> ListAsync(
        AuditLogQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Clamp(query.Page, 1, MaxPage);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);
        AdminValidation.EnsureInRange(query.From, query.To);
        if (query.From is { } f && query.To is { } t && f > t)
        {
            throw new ValidationException("from", M.RangeOrder);
        }
        var from = query.From?.ToDateTime(TimeOnly.MinValue);
        // Inclusive end day: everything before the next midnight.
        var before = query.To?.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var take = page * pageSize;
        var wants = (AuditEntityType type) => query.EntityType is null || query.EntityType == type;

        var rows = new List<AuditEventResponse>();
        var total = 0;

        if (wants(AuditEntityType.Claim))
        {
            var claims = _db.ClaimStatusHistory.AsNoTracking().AsQueryable();
            if (query.ActorId is { } actor) claims = claims.Where(h => h.ChangedByUserId == actor);
            if (from is not null) claims = claims.Where(h => h.ChangedAt >= from);
            if (before is not null) claims = claims.Where(h => h.ChangedAt < before);
            total += await claims.CountAsync(cancellationToken);
            var found = await claims
                .OrderByDescending(h => h.ChangedAt).ThenBy(h => h.Id)
                .Take(take)
                .Select(h => new
                {
                    h.Id, h.ChangedAt, h.ChangedByUserId, h.ChangedByUser.FullName, h.ChangedByUser.Role,
                    h.ClaimId, h.Claim.ClaimNumber, h.FromStatus, h.ToStatus
                })
                .ToListAsync(cancellationToken);
            rows.AddRange(found.Select(h => new AuditEventResponse(
                h.Id, h.ChangedAt, h.ChangedByUserId, h.FullName, h.Role, AuditEntityType.Claim, h.ClaimId,
                h.ClaimNumber, StatusChanged, h.FromStatus?.ToString(), h.ToStatus.ToString())));
        }

        if (wants(AuditEntityType.Policy))
        {
            var policies = _db.PolicyStatusHistory.AsNoTracking().AsQueryable();
            if (query.ActorId is { } actor) policies = policies.Where(h => h.ChangedByUserId == actor);
            if (from is not null) policies = policies.Where(h => h.ChangedAt >= from);
            if (before is not null) policies = policies.Where(h => h.ChangedAt < before);
            total += await policies.CountAsync(cancellationToken);
            var found = await policies
                .OrderByDescending(h => h.ChangedAt).ThenBy(h => h.Id)
                .Take(take)
                .Select(h => new
                {
                    h.Id, h.ChangedAt, h.ChangedByUserId,
                    Actor = _db.Users.Where(u => u.Id == h.ChangedByUserId)
                        .Select(u => new { u.FullName, u.Role }).FirstOrDefault(),
                    h.PolicyId, h.Policy.PolicyNumber, h.FromStatus, h.ToStatus
                })
                .ToListAsync(cancellationToken);
            rows.AddRange(found.Select(h => new AuditEventResponse(
                h.Id, h.ChangedAt, h.ChangedByUserId, h.Actor?.FullName, h.Actor?.Role, AuditEntityType.Policy,
                h.PolicyId, h.PolicyNumber, StatusChanged, h.FromStatus?.ToString(), h.ToStatus.ToString())));
        }

        var staffTypes = new List<AuditAction>();
        if (wants(AuditEntityType.User))
        {
            staffTypes.AddRange([AuditAction.StaffCreated, AuditAction.StaffDeactivated,
                AuditAction.StaffReactivated, AuditAction.RoleChanged]);
        }
        if (wants(AuditEntityType.Customer)) staffTypes.Add(AuditAction.CustomerAssigned);
        if (staffTypes.Count > 0)
        {
            var entries = _db.AuditEntries.AsNoTracking().Where(a => staffTypes.Contains(a.Action));
            if (query.ActorId is { } actor) entries = entries.Where(a => a.ActorUserId == actor);
            if (from is not null) entries = entries.Where(a => a.OccurredAt >= from);
            if (before is not null) entries = entries.Where(a => a.OccurredAt < before);
            total += await entries.CountAsync(cancellationToken);
            var found = await entries
                .OrderByDescending(a => a.OccurredAt).ThenBy(a => a.Id)
                .Take(take)
                .Select(a => new
                {
                    a.Id, a.OccurredAt, a.ActorUserId, a.Actor.FullName, a.Actor.Role, a.Action,
                    a.SubjectId, a.SubjectLabel, a.FromValue, a.ToValue
                })
                .ToListAsync(cancellationToken);
            rows.AddRange(found.Select(a => new AuditEventResponse(
                a.Id, a.OccurredAt, a.ActorUserId, a.FullName, a.Role,
                a.Action == AuditAction.CustomerAssigned ? AuditEntityType.Customer : AuditEntityType.User,
                a.SubjectId, a.SubjectLabel, a.Action.ToString(), a.FromValue, a.ToValue)));
        }

        var items = rows
            .OrderByDescending(r => r.OccurredAt).ThenBy(r => r.Id)
            .Skip(Paging.Skip(page, pageSize))
            .Take(pageSize)
            .ToList();
        return new PagedResult<AuditEventResponse>(items, page, pageSize, total);
    }
}
