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
    private const string Key = SearchText.KeyProperty;

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
        // Baku days, as the SPA's "today": from that day's midnight in Baku,
        // and the end day inclusive (everything before the next midnight).
        DateTime? from = query.From is { } fromDay ? BusinessCalendar.StartOfDayUtc(fromDay) : null;
        DateTime? before = query.To is { } toDay ? BusinessCalendar.StartOfDayUtc(toDay.AddDays(1)) : null;
        var take = page * pageSize;
        var wants = (AuditEntityType type) => query.EntityType is null || query.EntityType == type;
        var search = AuditSearch.From(query.Search, query.Actions);

        var rows = new List<AuditEventResponse>();
        var total = 0;

        if (wants(AuditEntityType.Claim))
        {
            var claims = _db.ClaimStatusHistory.AsNoTracking().AsQueryable();
            if (query.ActorId is { } actor) claims = claims.Where(h => h.ChangedByUserId == actor);
            if (from is not null) claims = claims.Where(h => h.ChangedAt >= from);
            if (before is not null) claims = claims.Where(h => h.ChangedAt < before);
            if (search is not null)
            {
                var (needle, code) = (search.Needle, search.Code);
                var statuses = search.Matching<ClaimStatus>();
                // Numbers as stored (upper-case ASCII), names and emails
                // through the folded keys: one rule (SearchText).
                claims = needle is null
                    ? claims.Where(h => statuses.Contains(h.ToStatus))
                    : claims.Where(h => statuses.Contains(h.ToStatus)
                        || h.Claim.ClaimNumber.Contains(code)
                        || h.Claim.Policy.PolicyNumber.Contains(code)
                        || EF.Property<string>(h.ChangedByUser, Key).Contains(needle)
                        || EF.Property<string>(h.Claim.Policy.Customer, Key).Contains(needle));
            }
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
            if (search is not null)
            {
                var (needle, code) = (search.Needle, search.Code);
                var statuses = search.Matching<PolicyStatus>();
                policies = needle is null
                    ? policies.Where(h => statuses.Contains(h.ToStatus))
                    : policies.Where(h => statuses.Contains(h.ToStatus)
                        || h.Policy.PolicyNumber.Contains(code)
                        || EF.Property<string>(h.Policy.Customer, Key).Contains(needle)
                        || _db.Users.Any(u => u.Id == h.ChangedByUserId
                            && EF.Property<string>(u, Key).Contains(needle)));
            }
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
        if (wants(AuditEntityType.Error))
        {
            staffTypes.AddRange([AuditAction.ErrorResolved, AuditAction.ErrorIgnored,
                AuditAction.ErrorReopened, AuditAction.ErrorsPurged]);
        }
        if (staffTypes.Count > 0)
        {
            var entries = _db.AuditEntries.AsNoTracking().Where(a => staffTypes.Contains(a.Action));
            if (query.ActorId is { } actor) entries = entries.Where(a => a.ActorUserId == actor);
            if (from is not null) entries = entries.Where(a => a.OccurredAt >= from);
            if (before is not null) entries = entries.Where(a => a.OccurredAt < before);
            if (search is not null)
            {
                var needle = search.Needle;
                var actions = search.Matching<AuditAction>();
                // The entry's key holds the subject as it read then (an email,
                // a customer's name) and the values (roles, the agent's name);
                // the subject's current name and email match too.
                entries = needle is null
                    ? entries.Where(a => actions.Contains(a.Action))
                    : entries.Where(a => actions.Contains(a.Action)
                        || EF.Property<string>(a, Key).Contains(needle)
                        || EF.Property<string>(a.Actor, Key).Contains(needle)
                        || _db.Users.Any(u => u.Id == a.SubjectId && EF.Property<string>(u, Key).Contains(needle))
                        || _db.Customers.Any(c => c.Id == a.SubjectId && EF.Property<string>(c, Key).Contains(needle)));
            }
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
                EntityTypeOf(a.Action),
                a.SubjectId, a.SubjectLabel, a.Action.ToString(), a.FromValue, a.ToValue)));
        }

        var items = rows
            .OrderByDescending(r => r.OccurredAt).ThenBy(r => r.Id)
            .Skip(Paging.Skip(page, pageSize))
            .Take(pageSize)
            .ToList();
        return new PagedResult<AuditEventResponse>(items, page, pageSize, total);
    }

    private static AuditEntityType EntityTypeOf(AuditAction action) => action switch
    {
        AuditAction.CustomerAssigned => AuditEntityType.Customer,
        AuditAction.ErrorResolved or AuditAction.ErrorIgnored or AuditAction.ErrorReopened or AuditAction.ErrorsPurged
            => AuditEntityType.Error,
        _ => AuditEntityType.User
    };
}

// The audit feed's text search. The typed text is folded (SearchText) and
// compared with the folded SearchKey columns, so case is ignored the same way
// for Latin, Cyrillic and Azerbaijani on SQLite and SQL Server. Status and
// action codes match when their name contains the text or the SPA sent them
// in Actions; the enum values are resolved here, so SQL sees a plain IN list.
internal sealed class AuditSearch
{
    private readonly HashSet<string> _codes;

    private AuditSearch(string? needle, HashSet<string> codes)
    {
        Needle = needle;
        _codes = codes;
    }

    public string? Needle { get; }

    // The needle as the app's own codes are stored (SearchText.Code).
    public string Code => Needle?.ToUpperInvariant() ?? string.Empty;

    public static AuditSearch? From(string? search, IReadOnlyCollection<string>? actions)
    {
        var term = search?.Trim();
        if (term is { Length: > AdminValidation.MaxSearchLength })
        {
            throw new ValidationException("search", M.SearchTooLong);
        }
        var codes = new HashSet<string>(
            (actions ?? []).Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a.Trim()),
            StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrEmpty(term) && codes.Count == 0) return null;
        var needle = SearchText.Fold(term);
        return new AuditSearch(needle.Length == 0 ? null : needle, codes);
    }

    public List<T> Matching<T>() where T : struct, Enum =>
        Enum.GetValues<T>()
            .Where(value =>
            {
                var name = value.ToString();
                return _codes.Contains(name)
                    || (Needle is not null && SearchText.Fold(name).Contains(Needle, StringComparison.Ordinal));
            })
            .ToList();
}
