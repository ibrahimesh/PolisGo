using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Application.Pricing.Dtos;
using PolisGo.Domain.Entities;

namespace PolisGo.Application.Pricing;

// Composition piece: looks up the policy type's BaseRate from the catalog,
// hands everything to the pure calculator. AsOfDate is passed in so the
// service itself stays testable without faking system time.
public class QuoteService : IQuoteService
{
    private readonly IApplicationDbContext _db;
    private readonly IPremiumCalculator _calculator;

    public QuoteService(IApplicationDbContext db, IPremiumCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<PremiumBreakdown> CalculateAsync(
        CalculateQuoteRequest request,
        DateOnly asOfDate,
        CancellationToken cancellationToken = default)
    {
        var code = request.PolicyTypeCode?.Trim().ToUpperInvariant() ?? string.Empty;

        var policyType = await _db.PolicyTypes
            .AsNoTracking()
            .FirstOrDefaultAsync(pt => pt.Code == code, cancellationToken)
            ?? throw new NotFoundException(nameof(PolicyType), request.PolicyTypeCode ?? "(null)");

        var input = new PremiumCalculationInput(
            PolicyTypeCode: policyType.Code,
            BaseRate: policyType.BaseRate,
            EngineCapacityCc: request.EngineCapacityCc,
            DriverBirthDate: request.DriverBirthDate,
            DrivingLicenseDate: request.DrivingLicenseDate,
            VehicleYear: request.VehicleYear,
            ClaimsInLast3Years: request.ClaimsInLast3Years,
            TermMonths: request.TermMonths,
            AsOfDate: asOfDate);

        return _calculator.Calculate(input);
    }
}
