using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies;

public class PolicyService : IPolicyService
{
    private const int MaxPageSize = 50;
    private const int StartDateHorizonDays = 60;
    private const int PolicyNumberMaxAttempts = 5;

    private readonly IApplicationDbContext _db;
    private readonly IPremiumCalculator _calculator;
    private readonly IPaymentGateway _paymentGateway;
    private readonly ICurrentUser _currentUser;

    public PolicyService(
        IApplicationDbContext db,
        IPremiumCalculator calculator,
        IPaymentGateway paymentGateway,
        ICurrentUser currentUser)
    {
        _db = db;
        _calculator = calculator;
        _paymentGateway = paymentGateway;
        _currentUser = currentUser;
    }

    public async Task<PolicyResponse> CreateAsync(
        CreatePolicyRequest request, CancellationToken cancellationToken = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var customerId = ResolveCustomerId(request.CustomerId);

        ValidateStartDate(request.StartDate, today);

        var customer = await _db.Customers
            .FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), customerId);

        var vehicle = await _db.Vehicles
            .FirstOrDefaultAsync(v => v.Id == request.VehicleId, cancellationToken)
            ?? throw new NotFoundException(nameof(Vehicle), request.VehicleId);

        if (vehicle.CustomerId != customerId)
        {
            // Return 404 (via NotFoundException) instead of 403 so a caller
            // cannot probe the existence of someone else's vehicle.
            throw new NotFoundException(nameof(Vehicle), request.VehicleId);
        }

        var code = (request.PolicyTypeCode ?? string.Empty).Trim().ToUpperInvariant();
        var policyType = await _db.PolicyTypes
            .FirstOrDefaultAsync(pt => pt.Code == code, cancellationToken)
            ?? throw new NotFoundException(nameof(PolicyType), request.PolicyTypeCode ?? "(null)");

        var endDate = request.StartDate.AddMonths(request.TermMonths).AddDays(-1);

        // Reject overlapping Draft/Active policies for the same vehicle + type.
        // Server-side recalculation also means pricing is fresh; this guards
        // against duplicate coverage.
        var sameTypePolicies = await _db.Policies
            .Where(p => p.VehicleId == vehicle.Id
                && p.PolicyTypeId == policyType.Id
                && (p.Status == PolicyStatus.Draft || p.Status == PolicyStatus.Active))
            .ToListAsync(cancellationToken);

        var candidateRange = new Policy
        {
            StartDate = request.StartDate.ToDateTime(TimeOnly.MinValue),
            EndDate = endDate.ToDateTime(TimeOnly.MinValue)
        };
        if (sameTypePolicies.Any(existing => existing.OverlapsWith(candidateRange)))
        {
            throw new ConflictException(
                "An active or draft policy of this type already covers the vehicle in the chosen period.");
        }

        var threeYearsAgo = DateTime.UtcNow.AddYears(-3);
        var claimCount = await _db.Claims
            .Where(c => c.Policy.CustomerId == customerId)
            .Where(c => c.Status == ClaimStatus.Approved || c.Status == ClaimStatus.Paid)
            .Where(c => c.IncidentDate >= threeYearsAgo)
            .CountAsync(cancellationToken);

        var driverBirth = DateOnly.FromDateTime(customer.BirthDate);
        var driverLicense = DateOnly.FromDateTime(customer.DrivingLicenseDate);

        // Premium is ALWAYS computed server-side from stored data — the caller
        // doesn't send one, and even if the client-side quote differed we trust
        // only this calculation.
        var breakdown = _calculator.Calculate(new PremiumCalculationInput(
            PolicyTypeCode: policyType.Code,
            BaseRate: policyType.BaseRate,
            EngineCapacityCc: vehicle.EngineCapacityCc,
            DriverBirthDate: driverBirth,
            DrivingLicenseDate: driverLicense,
            VehicleYear: vehicle.Year,
            ClaimsInLast3Years: claimCount,
            TermMonths: request.TermMonths,
            AsOfDate: today));

        var policy = new Policy
        {
            Id = Guid.NewGuid(),
            PolicyNumber = await AllocatePolicyNumberAsync(today.Year, cancellationToken),
            CustomerId = customer.Id,
            VehicleId = vehicle.Id,
            PolicyTypeId = policyType.Id,
            AgentId = _currentUser.Role == UserRole.Agent ? _currentUser.UserId : null,
            StartDate = request.StartDate.ToDateTime(TimeOnly.MinValue),
            EndDate = endDate.ToDateTime(TimeOnly.MinValue),
            Premium = breakdown.Premium,
            Status = PolicyStatus.Draft,
            CreatedAt = DateTime.UtcNow
        };

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

        return Map(policy, policyType.Code);
    }

    public async Task<PolicyResponse> GetByIdAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var policy = await LoadVisibleAsync(policyId, cancellationToken);
        var code = await _db.PolicyTypes
            .Where(pt => pt.Id == policy.PolicyTypeId)
            .Select(pt => pt.Code)
            .FirstAsync(cancellationToken);
        return Map(policy, code);
    }

    public async Task<PagedResult<PolicyResponse>> ListAsync(
        int page, int pageSize, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.Policies.AsNoTracking().AsQueryable();
        query = ApplyRoleFilter(query);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await (
            from p in query
            join pt in _db.PolicyTypes on p.PolicyTypeId equals pt.Id
            orderby p.CreatedAt descending
            select new { Policy = p, Code = pt.Code })
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var mapped = items
            .Select(x => Map(x.Policy, x.Code))
            .ToList();

        return new PagedResult<PolicyResponse>(mapped, page, pageSize, totalCount);
    }

    public async Task<PayPolicyResponse> PayAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var policy = await LoadVisibleAsync(policyId, cancellationToken);

        // Idempotency guard: a Draft policy becomes Active once paid. Any
        // non-Draft status means a previous Pay already won the race.
        if (policy.Status != PolicyStatus.Draft)
        {
            throw new ConflictException(
                $"Policy {policy.PolicyNumber} is in status {policy.Status} and cannot be paid.");
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
            Status = PaymentStatus.Completed
        };
        _db.Payments.Add(payment);

        policy.Activate();

        // SaveChanges wraps the payment insert and the policy update in one
        // implicit transaction, so either both land or neither does.
        await _db.SaveChangesAsync(cancellationToken);

        var code = await _db.PolicyTypes
            .Where(pt => pt.Id == policy.PolicyTypeId)
            .Select(pt => pt.Code)
            .FirstAsync(cancellationToken);

        return new PayPolicyResponse(
            Policy: Map(policy, code),
            PaymentId: payment.Id,
            Amount: payment.Amount,
            Currency: Pricing.Tariff.Currency,
            Reference: receipt.Reference,
            PaidAt: payment.PaidAt);
    }

    public async Task<PolicyResponse> CancelAsync(
        Guid policyId, CancellationToken cancellationToken = default)
    {
        var policy = await LoadVisibleAsync(policyId, cancellationToken);
        policy.Cancel();
        await _db.SaveChangesAsync(cancellationToken);

        var code = await _db.PolicyTypes
            .Where(pt => pt.Id == policy.PolicyTypeId)
            .Select(pt => pt.Code)
            .FirstAsync(cancellationToken);

        return Map(policy, code);
    }

    private IQueryable<Policy> ApplyRoleFilter(IQueryable<Policy> query) => _currentUser.Role switch
    {
        UserRole.Client => _currentUser.CustomerId.HasValue
            ? query.Where(p => p.CustomerId == _currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        UserRole.Agent => query.Where(p => p.AgentId == _currentUser.UserId),
        _ => query // Adjuster and Admin see everything
    };

    // Loads a tracked policy the current user is allowed to see. Returns
    // NotFoundException both when the row is missing AND when it belongs to
    // somebody else — never leaks existence of other users' policies.
    private async Task<Policy> LoadVisibleAsync(Guid policyId, CancellationToken cancellationToken)
    {
        var query = _db.Policies.Where(p => p.Id == policyId);
        query = ApplyRoleFilter(query);

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

    private static void ValidateStartDate(DateOnly startDate, DateOnly today)
    {
        if (startDate < today)
        {
            throw new ValidationException(nameof(CreatePolicyRequest.StartDate),
                "Start date cannot be in the past.");
        }

        if (startDate > today.AddDays(StartDateHorizonDays))
        {
            throw new ValidationException(nameof(CreatePolicyRequest.StartDate),
                $"Start date cannot be more than {StartDateHorizonDays} days in the future.");
        }
    }

    private static PolicyResponse Map(Policy p, string code) => new(
        Id: p.Id,
        PolicyNumber: p.PolicyNumber,
        CustomerId: p.CustomerId,
        VehicleId: p.VehicleId,
        PolicyTypeId: p.PolicyTypeId,
        PolicyTypeCode: code,
        AgentId: p.AgentId,
        StartDate: DateOnly.FromDateTime(p.StartDate),
        EndDate: DateOnly.FromDateTime(p.EndDate),
        Premium: p.Premium,
        Currency: Pricing.Tariff.Currency,
        Status: p.Status,
        CreatedAt: p.CreatedAt);
}
