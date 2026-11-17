using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Application.Claims;

public class ClaimService : IClaimService
{
    private const int MaxPageSize = 50;
    private const int ClaimNumberMaxAttempts = 5;
    private const int MinDescriptionLength = 10;
    private const int MaxDescriptionLength = 2000;

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

        var policy = await _db.Policies
            .FirstOrDefaultAsync(p => p.Id == request.PolicyId, cancellationToken)
            ?? throw new NotFoundException(nameof(Policy), request.PolicyId);

        // 404 instead of 403 — don't reveal that the policy exists but isn't theirs.
        if (!IsPolicyVisibleForSubmission(policy, customerId))
        {
            throw new NotFoundException(nameof(Policy), request.PolicyId);
        }

        ValidateSubmit(request, policy);

        // Duplicate: same policy, same incident date, same amount, not Rejected.
        var sameDay = request.IncidentDate.Date;
        var duplicateExists = await _db.Claims.AnyAsync(c =>
            c.PolicyId == request.PolicyId
            && c.IncidentDate.Date == sameDay
            && c.ClaimedAmount == request.ClaimedAmount
            && c.Status != ClaimStatus.Rejected, cancellationToken);
        if (duplicateExists)
        {
            throw new ConflictException(
                "A claim for this policy, incident date and amount is already on file.");
        }

        var claim = new DomainClaim
        {
            Id = Guid.NewGuid(),
            ClaimNumber = await AllocateClaimNumberAsync(DateTime.UtcNow.Year, cancellationToken),
            PolicyId = policy.Id,
            IncidentDate = request.IncidentDate,
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

        return Map(claim, policy.PolicyNumber);
    }

    // ---------- Reads ----------

    public async Task<ClaimDetailResponse> GetByIdAsync(
        Guid claimId, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        var policyNumber = await _db.Policies
            .Where(p => p.Id == claim.PolicyId)
            .Select(p => p.PolicyNumber)
            .FirstAsync(cancellationToken);

        var history = await _db.ClaimStatusHistory
            .Where(h => h.ClaimId == claimId)
            .OrderBy(h => h.ChangedAt)
            .Select(h => new ClaimHistoryEntry(
                h.Id, h.FromStatus, h.ToStatus, h.ChangedByUserId, h.Comment, h.ChangedAt))
            .ToListAsync(cancellationToken);

        var documents = await _db.ClaimDocuments
            .Where(d => d.ClaimId == claimId)
            .OrderBy(d => d.UploadedAt)
            .Select(d => new ClaimDocumentResponse(d.Id, d.FileName, d.UploadedAt))
            .ToListAsync(cancellationToken);

        return new ClaimDetailResponse(Map(claim, policyNumber), history, documents);
    }

    public async Task<IReadOnlyList<ClaimHistoryEntry>> GetHistoryAsync(
        Guid claimId, CancellationToken cancellationToken = default)
    {
        // Make sure the caller is allowed to see the claim before exposing history.
        _ = await LoadVisibleAsync(claimId, cancellationToken);

        return await _db.ClaimStatusHistory
            .Where(h => h.ClaimId == claimId)
            .OrderBy(h => h.ChangedAt)
            .Select(h => new ClaimHistoryEntry(
                h.Id, h.FromStatus, h.ToStatus, h.ChangedByUserId, h.Comment, h.ChangedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<PagedResult<ClaimResponse>> ListAsync(
        ListClaimsFilter filter, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, filter.Page);
        var pageSize = Math.Clamp(filter.PageSize, 1, MaxPageSize);

        var query = _db.Claims.AsNoTracking().AsQueryable();
        query = ApplyRoleFilter(query);

        if (filter.Status.HasValue)
            query = query.Where(c => c.Status == filter.Status.Value);

        if (filter.AssignedToMe == true)
            query = query.Where(c => c.AssignedAdjusterId == _currentUser.UserId);

        if (filter.From.HasValue)
            query = query.Where(c => c.IncidentDate >= filter.From.Value);

        if (filter.To.HasValue)
            query = query.Where(c => c.IncidentDate <= filter.To.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await (
            from c in query
            join p in _db.Policies on c.PolicyId equals p.Id
            orderby c.CreatedAt descending
            select new { Claim = c, PolicyNumber = p.PolicyNumber })
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var mapped = items.Select(x => Map(x.Claim, x.PolicyNumber)).ToList();
        return new PagedResult<ClaimResponse>(mapped, page, pageSize, totalCount);
    }

    // ---------- Workflow transitions (delegate rules to the entity) ----------

    public async Task<ClaimResponse> ReviewAsync(
        Guid claimId, ReviewClaimRequest request, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        claim.StartReview(_currentUser.UserId, request.Comment);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapWithPolicyNumberAsync(claim, cancellationToken);
    }

    public async Task<ClaimResponse> ApproveAsync(
        Guid claimId, ApproveClaimRequest request, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        claim.Approve(request.ApprovedAmount, _currentUser.UserId, request.Comment,
            isAdmin: _currentUser.Role == UserRole.Admin);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapWithPolicyNumberAsync(claim, cancellationToken);
    }

    public async Task<ClaimResponse> RejectAsync(
        Guid claimId, RejectClaimRequest request, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);
        claim.Reject(_currentUser.UserId, request.Comment,
            isAdmin: _currentUser.Role == UserRole.Admin);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapWithPolicyNumberAsync(claim, cancellationToken);
    }

    public async Task<ClaimResponse> PayAsync(
        Guid claimId, PayClaimRequest request, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);

        // Gateway call BEFORE SaveChanges so a payout failure aborts without
        // touching the DB. Fake gateway always succeeds today.
        _ = await _payoutGateway.PayoutAsync(
            claim.Id, claim.ApprovedAmount ?? 0m, cancellationToken);

        claim.MarkPaid(_currentUser.UserId, request.Comment);
        await _db.SaveChangesAsync(cancellationToken);

        return await MapWithPolicyNumberAsync(claim, cancellationToken);
    }

    // ---------- Internal: role-aware filtering & loading ----------

    private IQueryable<DomainClaim> ApplyRoleFilter(IQueryable<DomainClaim> query)
        => ClaimAccess.VisibleTo(query, _currentUser);

    private async Task<DomainClaim> LoadVisibleAsync(Guid claimId, CancellationToken cancellationToken)
    {
        var query = _db.Claims.Where(c => c.Id == claimId);
        query = ApplyRoleFilter(query);

        return await query.FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(DomainClaim), claimId);
    }

    private static bool IsPolicyVisibleForSubmission(Policy policy, Guid customerId) =>
        policy.CustomerId == customerId;

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

    private void ValidateSubmit(SubmitClaimRequest request, Policy policy)
    {
        var errors = new Dictionary<string, string[]>();

        if (policy.Status != PolicyStatus.Active)
        {
            errors[nameof(request.PolicyId)] = new[] { "Claims can only be filed on Active policies." };
        }

        var today = DateTime.UtcNow.Date;
        if (request.IncidentDate.Date > today)
        {
            errors[nameof(request.IncidentDate)] = new[] { "Incident date cannot be in the future." };
        }
        else if (request.IncidentDate.Date < policy.StartDate.Date ||
                 request.IncidentDate.Date > policy.EndDate.Date)
        {
            errors[nameof(request.IncidentDate)] = new[] { "Incident date must fall within the policy period." };
        }

        if (request.ClaimedAmount <= 0)
        {
            errors[nameof(request.ClaimedAmount)] = new[] { "Claimed amount must be greater than zero." };
        }
        else if (request.ClaimedAmount > _options.MaxClaimAmount)
        {
            errors[nameof(request.ClaimedAmount)] = new[]
            {
                $"Claimed amount cannot exceed {_options.MaxClaimAmount} AZN."
            };
        }

        var description = request.Description?.Trim() ?? string.Empty;
        if (description.Length < MinDescriptionLength || description.Length > MaxDescriptionLength)
        {
            errors[nameof(request.Description)] = new[]
            {
                $"Description must be between {MinDescriptionLength} and {MaxDescriptionLength} characters."
            };
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private async Task<ClaimResponse> MapWithPolicyNumberAsync(DomainClaim claim, CancellationToken cancellationToken)
    {
        var policyNumber = await _db.Policies
            .Where(p => p.Id == claim.PolicyId)
            .Select(p => p.PolicyNumber)
            .FirstAsync(cancellationToken);
        return Map(claim, policyNumber);
    }

    internal static ClaimResponse Map(DomainClaim c, string policyNumber) => new(
        Id: c.Id,
        ClaimNumber: c.ClaimNumber,
        PolicyId: c.PolicyId,
        PolicyNumber: policyNumber,
        IncidentDate: c.IncidentDate,
        Description: c.Description,
        ClaimedAmount: c.ClaimedAmount,
        ApprovedAmount: c.ApprovedAmount,
        Status: c.Status,
        AssignedAdjusterId: c.AssignedAdjusterId,
        CreatedAt: c.CreatedAt);
}
