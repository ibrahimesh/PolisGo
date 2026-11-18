using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Application.Vehicles.Dtos;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

namespace PolisGo.Application.Policies;

public class PolicyService : IPolicyService
{
    private const int MaxPageSize = 50;
    private const int PolicyNumberMaxAttempts = 5;

    private readonly IApplicationDbContext _db;
    private readonly IPremiumCalculator _calculator;
    private readonly IPaymentGateway _paymentGateway;
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _clock;

    public PolicyService(
        IApplicationDbContext db,
        IPremiumCalculator calculator,
        IPaymentGateway paymentGateway,
        ICurrentUser currentUser,
        TimeProvider? clock = null)
    {
        _db = db;
        _calculator = calculator;
        _paymentGateway = paymentGateway;
        _currentUser = currentUser;
        _clock = clock ?? TimeProvider.System;
    }

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;
    private DateOnly Today => DateOnly.FromDateTime(UtcNow);

    public async Task<PremiumBreakdown> QuoteAsync(
        CreatePolicyRequest request, CancellationToken cancellationToken = default)
    {
        var priced = await PriceAsync(request, Today, cancellationToken);
        return priced.Breakdown;
    }

    public async Task<PolicyResponse> CreateAsync(
        CreatePolicyRequest request, CancellationToken cancellationToken = default)
    {
        var today = Today;
        var priced = await PriceAsync(request, today, cancellationToken);
        var breakdown = priced.Breakdown;

        var policy = new Policy
        {
            Id = Guid.NewGuid(),
            PolicyNumber = await AllocatePolicyNumberAsync(today.Year, cancellationToken),
            CustomerId = priced.CustomerId,
            VehicleId = priced.Vehicle.Id,
            PolicyTypeId = priced.PolicyType.Id,
            AgentId = _currentUser.Role == UserRole.Agent ? _currentUser.UserId : null,
            StartDate = request.StartDate.ToDateTime(TimeOnly.MinValue),
            EndDate = priced.EndDate.ToDateTime(TimeOnly.MinValue),
            Premium = breakdown.Premium,
            Status = PolicyStatus.Draft,
            CreatedAt = UtcNow,
            // Frozen so the policy page can explain this premium later, even
            // after the customer's age, claims or the tariff have moved on.
            Pricing = new PolicyPricing
            {
                BaseRate = breakdown.BaseRate,
                EngineFactor = breakdown.EngineFactor,
                DriverAgeFactor = breakdown.DriverAgeFactor,
                ExperienceFactor = breakdown.ExperienceFactor,
                VehicleAgeFactor = breakdown.VehicleAgeFactor,
                BonusMalusFactor = breakdown.BonusMalusFactor,
                TermFactor = breakdown.TermFactor,
                TotalFactor = breakdown.TotalFactor
            }
        };
        policy.RecordIssued(_currentUser.UserId);

        _db.Policies.Add(policy);

        // Retry on PolicyNumber unique-index collision — with 8 chars of base32
        // this almost never fires, but better to retry than fail the request.
        for (var attempt = 0; attempt < PolicyNumberMaxAttempts; attempt++)
        {
            try
            {
                await _db.SaveChangesAsync(cancellationToken);
                break;
            }
            catch (DbUpdateException) when (attempt < PolicyNumberMaxAttempts - 1)
            {
                policy.PolicyNumber = await AllocatePolicyNumberAsync(today.Year, cancellationToken);
            }
        }

        return await LoadResponseAsync(policy.Id, today, cancellationToken);
    }

    public async Task<PolicyResponse> GetByIdAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        return await LoadResponseAsync(policyId, Today, cancellationToken);
    }

    public async Task<PolicyDetailResponse> GetDetailAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var today = Today;
        var visible = PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser)
            .Where(p => p.Id == policyId);

        // Three fixed queries: the policy with its vehicle and pricing, then
        // its payments, then its history.
        var row = await visible
            .Select(p => new
            {
                Response = new PolicyRow(
                    p.Id, p.PolicyNumber, p.CustomerId, p.VehicleId, p.PolicyTypeId, p.PolicyType.Code,
                    p.AgentId, p.StartDate, p.EndDate, p.Premium, p.Status, p.CreatedAt,
                    p.Vehicle.Make, p.Vehicle.Model, p.Vehicle.Year, p.Vehicle.PlateNumber),
                HolderName = p.Customer.FullName,
                p.Vehicle.Vin,
                p.Vehicle.EngineCapacityCc,
                p.Pricing
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Policy), policyId);

        var payments = await _db.Payments.AsNoTracking()
            .Where(pay => pay.PolicyId == policyId)
            .OrderBy(pay => pay.PaidAt)
            .Select(pay => new PolicyPaymentResponse(
                pay.Id, pay.Amount, Tariff.Currency, pay.Method, pay.Status, pay.PaidAt, pay.Reference))
            .ToListAsync(cancellationToken);

        var history = await _db.PolicyStatusHistory.AsNoTracking()
            .Where(h => h.PolicyId == policyId)
            .OrderBy(h => h.ChangedAt)
            .Select(h => new PolicyHistoryEntry(h.FromStatus, h.ToStatus, h.ChangedAt, false))
            .ToListAsync(cancellationToken);

        var policy = row.Response.ToResponse(today);
        if (policy.Status == PolicyStatus.Expired && row.Response.Status == PolicyStatus.Active)
        {
            // Nobody performs the expiry, so it has no row; show it where it happened.
            history.Add(new PolicyHistoryEntry(
                PolicyStatus.Active,
                PolicyStatus.Expired,
                policy.EndDate.AddDays(1).ToDateTime(TimeOnly.MinValue),
                Automatic: true));
        }

        var vehicle = new VehicleResponse(
            row.Response.VehicleId, row.Response.CustomerId, row.Response.Make, row.Response.Model,
            row.Response.Year, row.EngineCapacityCc, row.Response.PlateNumber, row.Vin);

        var pricing = row.Pricing is { } p
            ? new PremiumBreakdown(p.BaseRate, p.EngineFactor, p.DriverAgeFactor, p.ExperienceFactor,
                p.VehicleAgeFactor, p.BonusMalusFactor, p.TermFactor, p.TotalFactor, policy.Premium, Tariff.Currency)
            : null;

        return new PolicyDetailResponse(policy, row.HolderName, vehicle, pricing, payments, history);
    }

    public async Task<PagedResult<PolicyResponse>> ListAsync(
        ListPoliciesQuery query, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);
        var today = Today;

        var policies = PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser);

        if (query.Status is { } status)
        {
            policies = policies.WhereEffectiveStatus(status, today);
        }

        if (!string.IsNullOrWhiteSpace(query.PolicyTypeCode))
        {
            var code = query.PolicyTypeCode.Trim().ToUpperInvariant();
            policies = policies.Where(p => p.PolicyType.Code == code);
        }

        var term = query.Search?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            if (term.Length > PolicyValidation.MaxSearchLength)
            {
                throw new ValidationException("search", PolicyValidation.Messages.SearchTooLong);
            }
            // Policy numbers and plates are stored upper-case, so an
            // upper-cased needle makes the match case-insensitive on any provider.
            var needle = term.ToUpperInvariant();
            policies = policies.Where(p =>
                p.PolicyNumber.Contains(needle) || p.Vehicle.PlateNumber.Contains(needle));
        }

        var totalCount = await policies.CountAsync(cancellationToken);

        var rows = await Project(Sort(policies, query.SortBy, query.SortDir)
                .Skip((page - 1) * pageSize)
                .Take(pageSize))
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => r.ToResponse(today)).ToList();
        return new PagedResult<PolicyResponse>(items, page, pageSize, totalCount);
    }

    public async Task<PayPolicyResponse> PayAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var today = Today;
        var policy = await LoadVisibleAsync(policyId, cancellationToken);

        // Idempotency guard: a Draft policy becomes Active once paid. Any
        // non-Draft status means a previous Pay already won the race.
        if (policy.Status != PolicyStatus.Draft)
        {
            throw new ConflictException(
                $"Policy {policy.PolicyNumber} is in status {policy.Status} and cannot be paid.");
        }

        // Paying a draft whose start date has passed would activate cover
        // backdated to before the payment — insurance bought after the event.
        if (DateOnly.FromDateTime(policy.StartDate) < today)
        {
            throw new ConflictException(PolicyValidation.Messages.DraftStartPassed);
        }

        var receipt = await _paymentGateway.ChargeAsync(
            policy.Id, policy.Premium, cancellationToken);

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            PolicyId = policy.Id,
            // Amount is the server-recalculated Premium — never trusted from the client.
            Amount = policy.Premium,
            PaidAt = receipt.ProcessedAt,
            Method = PaymentMethod.Online,
            Status = PaymentStatus.Completed,
            Reference = receipt.Reference
        };
        _db.Payments.Add(payment);

        policy.Activate(_currentUser.UserId);

        // SaveChanges wraps the payment insert, the policy update and the
        // history row in one implicit transaction: all land or none do.
        await _db.SaveChangesAsync(cancellationToken);

        return new PayPolicyResponse(
            Policy: await LoadResponseAsync(policy.Id, today, cancellationToken),
            PaymentId: payment.Id,
            Amount: payment.Amount,
            Currency: Tariff.Currency,
            Reference: receipt.Reference,
            PaidAt: payment.PaidAt);
    }

    public async Task<PolicyResponse> CancelAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var today = Today;
        var policy = await LoadVisibleAsync(policyId, cancellationToken);

        if (policy.StatusOn(today) == PolicyStatus.Expired)
        {
            throw new InvalidStateTransitionException(PolicyValidation.Messages.AlreadyExpired);
        }

        policy.Cancel(_currentUser.UserId);
        await _db.SaveChangesAsync(cancellationToken);

        return await LoadResponseAsync(policy.Id, today, cancellationToken);
    }

    // Validates the request, checks ownership and overlap, and prices it from
    // stored data. Shared by Quote and Create so the quoted premium is exactly
    // the premium that gets charged.
    private async Task<PricedPolicy> PriceAsync(
        CreatePolicyRequest request, DateOnly today, CancellationToken cancellationToken)
    {
        var customerId = ResolveCustomerId(request.CustomerId);
        ValidateRequest(request, today);

        var customer = await _db.Customers.AsNoTracking()
            .Where(c => c.Id == customerId)
            .Select(c => new { c.BirthDate, c.DrivingLicenseDate })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), customerId);

        var vehicle = await _db.Vehicles.AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == request.VehicleId, cancellationToken);

        // 404 (not 403) for someone else's vehicle, so a caller cannot probe
        // which vehicle ids exist.
        if (vehicle is null || vehicle.CustomerId != customerId)
        {
            throw new NotFoundException(nameof(Vehicle), request.VehicleId);
        }

        var code = request.PolicyTypeCode.Trim().ToUpperInvariant();
        var policyType = await _db.PolicyTypes.AsNoTracking()
            .FirstOrDefaultAsync(pt => pt.Code == code, cancellationToken)
            ?? throw new NotFoundException(nameof(PolicyType), request.PolicyTypeCode);

        var startDate = request.StartDate.ToDateTime(TimeOnly.MinValue);
        var endDate = request.StartDate.AddMonths(request.TermMonths).AddDays(-1);
        var endDateTime = endDate.ToDateTime(TimeOnly.MinValue);

        // Reject overlapping Draft/Active cover for the same vehicle + type
        // (inclusive ranges, same rule as Policy.OverlapsWith).
        var overlaps = await _db.Policies.AnyAsync(p =>
            p.VehicleId == vehicle.Id
            && p.PolicyTypeId == policyType.Id
            && (p.Status == PolicyStatus.Draft || p.Status == PolicyStatus.Active)
            && p.StartDate <= endDateTime
            && startDate <= p.EndDate, cancellationToken);
        if (overlaps)
        {
            throw new ConflictException(PolicyValidation.Messages.Overlap);
        }

        var threeYearsAgo = UtcNow.AddYears(-3);
        var claimCount = await _db.Claims
            .Where(c => c.Policy.CustomerId == customerId)
            .Where(c => c.Status == ClaimStatus.Approved || c.Status == ClaimStatus.Paid)
            .Where(c => c.IncidentDate >= threeYearsAgo)
            .CountAsync(cancellationToken);

        // Premium is ALWAYS computed server-side from stored data — the caller
        // doesn't send one, and even if a client-side estimate differed we
        // trust only this calculation.
        var breakdown = _calculator.Calculate(new PremiumCalculationInput(
            PolicyTypeCode: policyType.Code,
            BaseRate: policyType.BaseRate,
            EngineCapacityCc: vehicle.EngineCapacityCc,
            DriverBirthDate: DateOnly.FromDateTime(customer.BirthDate),
            DrivingLicenseDate: DateOnly.FromDateTime(customer.DrivingLicenseDate),
            VehicleYear: vehicle.Year,
            ClaimsInLast3Years: claimCount,
            TermMonths: request.TermMonths,
            AsOfDate: today));

        return new PricedPolicy(customerId, vehicle, policyType, endDate, breakdown);
    }

    private sealed record PricedPolicy(
        Guid CustomerId, Vehicle Vehicle, PolicyType PolicyType, DateOnly EndDate, PremiumBreakdown Breakdown);

    private static void ValidateRequest(CreatePolicyRequest request, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.VehicleId == Guid.Empty)
            errors[nameof(request.VehicleId)] = [PolicyValidation.Messages.VehicleRequired];

        if (string.IsNullOrWhiteSpace(request.PolicyTypeCode))
            errors[nameof(request.PolicyTypeCode)] = [PolicyValidation.Messages.PolicyTypeRequired];

        if (request.StartDate < today)
            errors[nameof(request.StartDate)] = [PolicyValidation.Messages.StartDateInPast];
        else if (request.StartDate > today.AddDays(PolicyValidation.StartDateHorizonDays))
            errors[nameof(request.StartDate)] = [PolicyValidation.Messages.StartDateTooFar];

        if (request.TermMonths is < PolicyValidation.MinTermMonths or > PolicyValidation.MaxTermMonths)
            errors[nameof(request.TermMonths)] = [PolicyValidation.Messages.TermOutOfRange];

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private static IQueryable<Policy> Sort(IQueryable<Policy> query, PolicySortBy sortBy, SortDirection dir)
    {
        var asc = dir == SortDirection.Asc;
        IOrderedQueryable<Policy> ordered = sortBy switch
        {
            PolicySortBy.StartDate => asc ? query.OrderBy(p => p.StartDate) : query.OrderByDescending(p => p.StartDate),
            PolicySortBy.EndDate => asc ? query.OrderBy(p => p.EndDate) : query.OrderByDescending(p => p.EndDate),
            PolicySortBy.Premium => asc ? query.OrderBy(p => p.Premium) : query.OrderByDescending(p => p.Premium),
            PolicySortBy.PolicyNumber => asc ? query.OrderBy(p => p.PolicyNumber) : query.OrderByDescending(p => p.PolicyNumber),
            _ => asc ? query.OrderBy(p => p.CreatedAt) : query.OrderByDescending(p => p.CreatedAt)
        };
        // Unique tie-breaker so paging is stable when sort values repeat.
        return ordered.ThenBy(p => p.Id);
    }

    internal static IQueryable<PolicyRow> Project(IQueryable<Policy> query) =>
        query.Select(p => new PolicyRow(
            p.Id, p.PolicyNumber, p.CustomerId, p.VehicleId, p.PolicyTypeId, p.PolicyType.Code,
            p.AgentId, p.StartDate, p.EndDate, p.Premium, p.Status, p.CreatedAt,
            p.Vehicle.Make, p.Vehicle.Model, p.Vehicle.Year, p.Vehicle.PlateNumber));

    private async Task<PolicyResponse> LoadResponseAsync(
        Guid policyId, DateOnly today, CancellationToken cancellationToken)
    {
        var row = await Project(PolicyAccess.VisibleTo(_db.Policies.AsNoTracking(), _currentUser)
                .Where(p => p.Id == policyId))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Policy), policyId);
        return row.ToResponse(today);
    }

    // Loads a tracked policy the current user is allowed to see. Returns
    // NotFoundException both when the row is missing AND when it belongs to
    // somebody else — never leaks existence of other users' policies.
    private async Task<Policy> LoadVisibleAsync(Guid policyId, CancellationToken cancellationToken)
    {
        var query = PolicyAccess.VisibleTo(_db.Policies.Where(p => p.Id == policyId), _currentUser);

        return await query.FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Policy), policyId);
    }

    private async Task<string> AllocatePolicyNumberAsync(int year, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < PolicyNumberMaxAttempts; attempt++)
        {
            var candidate = PolicyNumberGenerator.Generate(year);
            if (!await _db.Policies.AnyAsync(p => p.PolicyNumber == candidate, cancellationToken))
            {
                return candidate;
            }
        }
        // Even after retries — vanishingly unlikely — surface a loud error.
        throw new InvalidOperationException("Could not allocate a unique PolicyNumber.");
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
}

// Flat projection row: one SELECT with the type code and vehicle summary.
internal sealed record PolicyRow(
    Guid Id,
    string PolicyNumber,
    Guid CustomerId,
    Guid VehicleId,
    Guid PolicyTypeId,
    string PolicyTypeCode,
    Guid? AgentId,
    DateTime StartDate,
    DateTime EndDate,
    decimal Premium,
    PolicyStatus Status,
    DateTime CreatedAt,
    string Make,
    string Model,
    int Year,
    string PlateNumber)
{
    public PolicyResponse ToResponse(DateOnly today)
    {
        var effective = Status == PolicyStatus.Active && DateOnly.FromDateTime(EndDate) < today
            ? PolicyStatus.Expired
            : Status;
        return new PolicyResponse(
            Id, PolicyNumber, CustomerId, VehicleId, PolicyTypeId, PolicyTypeCode, AgentId,
            DateOnly.FromDateTime(StartDate), DateOnly.FromDateTime(EndDate), Premium, Tariff.Currency,
            effective, CreatedAt,
            new PolicyVehicleSummary(VehicleId, Make, Model, Year, PlateNumber));
    }
}
