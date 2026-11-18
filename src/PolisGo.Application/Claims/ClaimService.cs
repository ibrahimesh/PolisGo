using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims.Documents;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Policies;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using DomainClaim = PolisGo.Domain.Entities.Claim;
using M = PolisGo.Application.Claims.ClaimValidation.Messages;

namespace PolisGo.Application.Claims;

public class ClaimService : IClaimService
{
    private const int MaxPageSize = 50;
    private const int ClaimNumberMaxAttempts = 5;

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IPayoutGateway _payoutGateway;
    private readonly ClaimOptions _options;

    public ClaimService(
        IApplicationDbContext db,
        ICurrentUser currentUser,
        IPayoutGateway payoutGateway,
        IOptions<ClaimOptions> options)
    {
        _db = db;
        _currentUser = currentUser;
        _payoutGateway = payoutGateway;
        _options = options.Value;
    }

    // ---------- Submit ----------

    public async Task<ClaimResponse> SubmitAsync(
        SubmitClaimRequest request, CancellationToken cancellationToken = default)
    {
        var customerId = ResolveCustomerId(request.CustomerId);

        // PolicyAccess: an agent files only on policies they sold, as for
        // every other policy endpoint.
        var policy = await PolicyAccess.VisibleTo(_db.Policies, _currentUser)
            .FirstOrDefaultAsync(p => p.Id == request.PolicyId, cancellationToken)
            ?? throw new NotFoundException(nameof(Policy), request.PolicyId);

        // 404 instead of 403 — don't reveal that the policy exists but isn't theirs.
        if (policy.CustomerId != customerId)
        {
            throw new NotFoundException(nameof(Policy), request.PolicyId);
        }

        ValidateSubmit(request, policy);

        // Duplicate: same policy, same incident date, same amount, still alive.
        var sameDay = request.IncidentDate.Date;
        var duplicateExists = await _db.Claims.AnyAsync(c =>
            c.PolicyId == request.PolicyId
            && c.IncidentDate.Date == sameDay
            && c.ClaimedAmount == request.ClaimedAmount
            && c.Status != ClaimStatus.Rejected
            && c.Status != ClaimStatus.Withdrawn, cancellationToken);
        if (duplicateExists)
        {
            throw new ConflictException(M.Duplicate);
        }

        var claim = new DomainClaim
        {
            Id = Guid.NewGuid(),
            ClaimNumber = await AllocateClaimNumberAsync(DateTime.UtcNow.Year, cancellationToken),
            PolicyId = policy.Id,
            IncidentDate = request.IncidentDate.Date,
            IncidentType = request.IncidentType,
            Location = request.Location!.Trim(),
            Description = request.Description.Trim(),
            ClaimedAmount = request.ClaimedAmount,
            Status = ClaimStatus.Submitted,
            CreatedAt = DateTime.UtcNow
        };

        // First history row at the start of the audit trail (null -> Submitted).
        // Id intentionally left default — EF's Guid generator fills it so the
        // entity is classified as Added, not Modified.
        claim.StatusHistory.Add(new ClaimStatusHistory
        {
            FromStatus = null,
            ToStatus = ClaimStatus.Submitted,
            ChangedByUserId = _currentUser.UserId,
            Comment = "Claim submitted.",
            ChangedAt = claim.CreatedAt
        });

        _db.Claims.Add(claim);

        for (var attempt = 0; attempt < ClaimNumberMaxAttempts; attempt++)
        {
            try
            {
                await _db.SaveChangesAsync(cancellationToken);
                break;
            }
            catch (DbUpdateException) when (attempt < ClaimNumberMaxAttempts - 1)
            {
                claim.ClaimNumber = await AllocateClaimNumberAsync(DateTime.UtcNow.Year, cancellationToken);
            }
        }

        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    // ---------- Reads ----------

    public async Task<ClaimDetailResponse> GetByIdAsync(
        Guid claimId, CancellationToken cancellationToken = default)
    {
        var claim = await Project(ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser)
                .Where(c => c.Id == claimId))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(DomainClaim), claimId);

        var policy = await _db.Policies.AsNoTracking()
            .Where(p => p.Id == claim.PolicyId)
            .Select(p => new
            {
                p.Id, p.PolicyNumber, p.PolicyType.Code, p.StartDate, p.EndDate,
                Vehicle = new PolicyVehicleSummary(p.VehicleId, p.Vehicle.Make, p.Vehicle.Model,
                    p.Vehicle.Year, p.Vehicle.PlateNumber),
                Customer = new ClaimCustomerSummary(p.CustomerId, p.Customer.FullName, p.Customer.Email,
                    p.Customer.Phone)
            })
            .FirstAsync(cancellationToken);

        var history = await HistoryQuery(claimId).ToListAsync(cancellationToken);

        var documents = (await _db.ClaimDocuments.AsNoTracking()
                .Where(d => d.ClaimId == claimId)
                .OrderBy(d => d.UploadedAt).ThenBy(d => d.Id)
                .Select(d => new { d.Id, d.FileName, d.UploadedAt })
                .ToListAsync(cancellationToken))
            .Select(d => new ClaimDocumentResponse(
                d.Id, d.FileName, ClaimDocumentService.ContentTypeFor(d.FileName), d.UploadedAt))
            .ToList();

        var open = claim.Status is ClaimStatus.Submitted or ClaimStatus.UnderReview;
        return new ClaimDetailResponse(
            claim,
            new ClaimPolicySummary(policy.Id, policy.PolicyNumber, policy.Code,
                DateOnly.FromDateTime(policy.StartDate), DateOnly.FromDateTime(policy.EndDate), policy.Vehicle),
            policy.Customer,
            history,
            documents,
            CanWithdraw: open && CanWithdrawRole(_currentUser.Role),
            CanAddDocuments: open && documents.Count < ClaimValidation.MaxDocumentsPerClaim,
            MaxDocuments: ClaimValidation.MaxDocumentsPerClaim,
            Actions: ClaimActions.For(claim.Status, claim.AssignedAdjusterId, _currentUser));
    }

    public async Task<IReadOnlyList<ClaimHistoryEntry>> GetHistoryAsync(
        Guid claimId, CancellationToken cancellationToken = default)
    {
        // Make sure the caller is allowed to see the claim before exposing history.
        await EnsureVisibleAsync(claimId, cancellationToken);
        return await HistoryQuery(claimId).ToListAsync(cancellationToken);
    }

    public async Task<PagedResult<ClaimResponse>> ListAsync(
        ListClaimsFilter filter, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, filter.Page);
        var pageSize = Math.Clamp(filter.PageSize, 1, MaxPageSize);

        var query = Filter(filter);
        var totalCount = await query.CountAsync(cancellationToken);

        var items = await Project(Sort(query, filter.SortBy, filter.SortDir))
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<ClaimResponse>(items, page, pageSize, totalCount);
    }

    public async Task<IReadOnlyList<ClaimResponse>> ExportAsync(
        ListClaimsFilter filter, CancellationToken cancellationToken = default)
    {
        var query = Filter(filter);
        if (await query.CountAsync(cancellationToken) > ExportLimits.MaxRows)
        {
            throw new ValidationException("export", ExportLimits.TooManyRows);
        }
        return await Project(Sort(query, filter.SortBy, filter.SortDir)).ToListAsync(cancellationToken);
    }

    // The list's filters, shared by the page and the CSV export so a download
    // holds exactly what the queue shows.
    private IQueryable<DomainClaim> Filter(ListClaimsFilter filter)
    {
        var query = ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser);

        if (filter.Status.HasValue)
            query = query.Where(c => c.Status == filter.Status.Value);
        else if (filter.Open == true)
            query = query.Where(c => c.Status == ClaimStatus.Submitted || c.Status == ClaimStatus.UnderReview);

        if (filter.AssignedToMe == true)
            query = query.Where(c => c.AssignedAdjusterId == _currentUser.UserId);

        if (filter.From.HasValue)
            query = query.Where(c => c.IncidentDate >= filter.From.Value);

        if (filter.To.HasValue)
            query = query.Where(c => c.IncidentDate <= filter.To.Value);

        var term = filter.Search?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            if (term.Length > ClaimValidation.MaxSearchLength)
            {
                throw new ValidationException("search", M.SearchTooLong);
            }
            var needle = term.ToUpperInvariant();
            query = query.Where(c =>
                c.ClaimNumber.ToUpper().Contains(needle) || c.Policy.PolicyNumber.ToUpper().Contains(needle)
                || c.Policy.Customer.FullName.ToUpper().Contains(needle));
        }

        return query;
    }

    // ---------- Workflow transitions (delegate rules to the entity) ----------

    public async Task<ClaimResponse> ReviewAsync(
        Guid claimId, ReviewClaimRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCommentLength(request.Comment);
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        EnsureVersion(claim, request.RowVersion);
        claim.StartReview(_currentUser.UserId, NullIfBlank(request.Comment));
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    public async Task<ClaimResponse> ApproveAsync(
        Guid claimId, ApproveClaimRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCommentLength(request.Comment);
        if (request.ApprovedAmount <= 0)
        {
            throw new ValidationException("approvedAmount", M.ApprovedAmountNotPositive);
        }
        if (decimal.Round(request.ApprovedAmount, 2) != request.ApprovedAmount)
        {
            throw new ValidationException("approvedAmount", M.ApprovedAmountPrecision);
        }

        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        EnsureVersion(claim, request.RowVersion);
        // A field error only while a decision is possible; otherwise the
        // state conflict from the entity is the real answer.
        if (claim.Status == ClaimStatus.UnderReview && request.ApprovedAmount > claim.ClaimedAmount)
        {
            throw new ValidationException("approvedAmount", M.ApprovedAmountAboveClaimed);
        }
        claim.Approve(request.ApprovedAmount, _currentUser.UserId, NullIfBlank(request.Comment) ?? string.Empty,
            isAdmin: _currentUser.Role == UserRole.Admin);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    public async Task<ClaimResponse> RejectAsync(
        Guid claimId, RejectClaimRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCommentLength(request.Comment);
        var reason = NullIfBlank(request.Comment)
            ?? throw new ValidationException("comment", M.RejectionReasonRequired);
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        EnsureVersion(claim, request.RowVersion);
        claim.Reject(_currentUser.UserId, reason,
            isAdmin: _currentUser.Role == UserRole.Admin);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    public async Task<ClaimResponse> PayAsync(
        Guid claimId, PayClaimRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCommentLength(request.Comment);
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        EnsureVersion(claim, request.RowVersion);
        if (claim.Status != ClaimStatus.Approved)
        {
            // Throws the usual transition error before the gateway: no payout
            // may go out for a claim that then can't be marked paid.
            claim.MarkPaid(_currentUser.UserId);
        }

        // Gateway call BEFORE SaveChanges so a payout failure aborts without
        // touching the DB. Fake gateway always succeeds today.
        _ = await _payoutGateway.PayoutAsync(
            claim.Id, claim.ApprovedAmount ?? 0m, cancellationToken);

        claim.MarkPaid(_currentUser.UserId, NullIfBlank(request.Comment));
        await _db.SaveChangesAsync(cancellationToken);

        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    public async Task<ClaimResponse> WithdrawAsync(
        Guid claimId, WithdrawClaimRequest request, CancellationToken cancellationToken = default)
    {
        var reason = request.Reason?.Trim();
        if (reason is { Length: > ClaimValidation.MaxReasonLength })
        {
            throw new ValidationException(nameof(request.Reason), M.ReasonTooLong);
        }

        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        claim.Withdraw(_currentUser.UserId, string.IsNullOrEmpty(reason) ? null : reason);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(claim.Id, cancellationToken);
    }

    // ---------- Internal ----------

    // Withdrawing is the customer's decision; staff who act for them (their
    // Agent, an Admin) may do it too, adjusters never.
    internal static bool CanWithdrawRole(UserRole role) =>
        role is UserRole.Client or UserRole.Agent or UserRole.Admin;

    private async Task<DomainClaim> LoadVisibleAsync(Guid claimId, CancellationToken cancellationToken)
    {
        return await ClaimAccess.VisibleTo(_db.Claims.Where(c => c.Id == claimId), _currentUser)
                .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(DomainClaim), claimId);
    }

    private async Task EnsureVisibleAsync(Guid claimId, CancellationToken cancellationToken)
    {
        var visible = await ClaimAccess.VisibleTo(_db.Claims.AsNoTracking(), _currentUser)
            .AnyAsync(c => c.Id == claimId, cancellationToken);
        if (!visible)
        {
            throw new NotFoundException(nameof(DomainClaim), claimId);
        }
    }

    private IQueryable<ClaimHistoryEntry> HistoryQuery(Guid claimId) =>
        _db.ClaimStatusHistory.AsNoTracking()
            .Where(h => h.ClaimId == claimId)
            .OrderBy(h => h.ChangedAt).ThenBy(h => h.Id)
            .Select(h => new ClaimHistoryEntry(
                h.Id, h.FromStatus, h.ToStatus, h.ChangedByUserId,
                h.ChangedByUser.Role, h.ChangedByUser.FullName, h.Comment, h.ChangedAt));

    private Task<ClaimResponse> ProjectOneAsync(Guid claimId, CancellationToken cancellationToken) =>
        Project(_db.Claims.AsNoTracking().Where(c => c.Id == claimId)).FirstAsync(cancellationToken);

    internal static IQueryable<ClaimResponse> Project(IQueryable<DomainClaim> query) =>
        query.Select(c => new ClaimResponse(
            c.Id,
            c.ClaimNumber,
            c.PolicyId,
            c.Policy.PolicyNumber,
            c.Policy.PolicyType.Code,
            c.IncidentDate,
            c.IncidentType,
            c.Location,
            c.Description,
            c.ClaimedAmount,
            c.ApprovedAmount,
            c.Status,
            c.AssignedAdjusterId,
            c.CreatedAt,
            c.StatusHistory.Max(h => (DateTime?)h.ChangedAt) ?? c.CreatedAt,
            c.Policy.CustomerId,
            c.Policy.Customer.FullName,
            c.AssignedAdjuster != null ? c.AssignedAdjuster.FullName : null,
            c.RowVersion));

    private static IQueryable<DomainClaim> Sort(IQueryable<DomainClaim> query, ClaimSortBy sortBy, SortDirection dir)
    {
        var asc = dir == SortDirection.Asc;
        IOrderedQueryable<DomainClaim> ordered = sortBy switch
        {
            ClaimSortBy.IncidentDate => asc ? query.OrderBy(c => c.IncidentDate) : query.OrderByDescending(c => c.IncidentDate),
            ClaimSortBy.ClaimedAmount => asc ? query.OrderBy(c => c.ClaimedAmount) : query.OrderByDescending(c => c.ClaimedAmount),
            ClaimSortBy.ClaimNumber => asc ? query.OrderBy(c => c.ClaimNumber) : query.OrderByDescending(c => c.ClaimNumber),
            _ => asc ? query.OrderBy(c => c.CreatedAt) : query.OrderByDescending(c => c.CreatedAt)
        };
        // Unique tie-breaker so paging is stable when sort values repeat.
        return ordered.ThenBy(c => c.Id);
    }

    private async Task<string> AllocateClaimNumberAsync(int year, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < ClaimNumberMaxAttempts; attempt++)
        {
            var candidate = ClaimNumberGenerator.Generate(year);
            if (!await _db.Claims.AnyAsync(c => c.ClaimNumber == candidate, cancellationToken))
            {
                return candidate;
            }
        }
        throw new InvalidOperationException("Could not allocate a unique ClaimNumber.");
    }

    private Guid ResolveCustomerId(Guid? requestedCustomerId)
    {
        if (_currentUser.Role == UserRole.Client)
        {
            if (!_currentUser.CustomerId.HasValue)
            {
                throw new UnauthorizedException("Client account has no linked customer profile.");
            }
            return _currentUser.CustomerId.Value;
        }

        if (!requestedCustomerId.HasValue)
        {
            throw new ValidationException("customerId", "customerId is required for staff accounts.");
        }
        return requestedCustomerId.Value;
    }

    // The caller decided on the version they saw; if someone has changed the
    // claim since, refuse rather than apply a decision made on stale facts.
    // SaveChanges still checks the token for a change landing in between.
    private static void EnsureVersion(DomainClaim claim, Guid? expected)
    {
        if (expected is { } version && version != claim.RowVersion)
        {
            throw new ConcurrencyConflictException();
        }
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // The history Comment column is 1000 characters; SQL Server would fail the
    // insert with a 500 (SQLite ignores the length), so check it up front.
    private static void EnsureCommentLength(string? comment)
    {
        if (comment is { Length: > ClaimValidation.MaxCommentLength })
        {
            throw new ValidationException("comment", M.CommentTooLong);
        }
    }

    private void ValidateSubmit(SubmitClaimRequest request, Policy policy)
    {
        var errors = new Dictionary<string, string[]>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Effective status: an Active policy past its end date reads as Expired
        // everywhere else, so it can't take a new claim either.
        if (policy.StatusOn(today) != PolicyStatus.Active)
        {
            errors[nameof(request.PolicyId)] = [M.PolicyNotActive];
        }

        var incident = DateOnly.FromDateTime(request.IncidentDate);
        if (incident > today)
        {
            errors[nameof(request.IncidentDate)] = [M.IncidentDateInFuture];
        }
        else if (incident < DateOnly.FromDateTime(policy.StartDate) || incident > DateOnly.FromDateTime(policy.EndDate))
        {
            errors[nameof(request.IncidentDate)] = [M.IncidentDateOutsideCover];
        }

        if (request.IncidentType is null || !Enum.IsDefined(request.IncidentType.Value))
        {
            errors[nameof(request.IncidentType)] = [M.IncidentTypeRequired];
        }

        var location = request.Location?.Trim() ?? string.Empty;
        if (location.Length < ClaimValidation.MinLocationLength || location.Length > ClaimValidation.MaxLocationLength)
        {
            errors[nameof(request.Location)] = [M.LocationLength];
        }

        if (request.ClaimedAmount <= 0)
        {
            errors[nameof(request.ClaimedAmount)] = [M.AmountNotPositive];
        }
        else if (request.ClaimedAmount > _options.MaxClaimAmount)
        {
            errors[nameof(request.ClaimedAmount)] = [M.AmountTooHigh];
        }
        else if (decimal.Round(request.ClaimedAmount, 2) != request.ClaimedAmount)
        {
            // decimal(18,2) would round it silently on SQL Server.
            errors[nameof(request.ClaimedAmount)] = [M.AmountPrecision];
        }

        var description = request.Description?.Trim() ?? string.Empty;
        if (description.Length < ClaimValidation.MinDescriptionLength
            || description.Length > ClaimValidation.MaxDescriptionLength)
        {
            errors[nameof(request.Description)] = [M.DescriptionLength];
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }
}
