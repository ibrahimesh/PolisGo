using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Pricing;
using PolisGo.Application.PolicyTypes.Dtos;

namespace PolisGo.Application.PolicyTypes;

// The PolicyTypes table (seeded by PolicyTypeConfiguration) is the single
// catalogue: the same rows quoting and policy issuance look up by Code. No
// second list exists, so adding a type there surfaces it here automatically.
public class PolicyTypeService : IPolicyTypeService
{
    private readonly IApplicationDbContext _db;

    public PolicyTypeService(IApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<PolicyTypeResponse>> ListAsync(
        CancellationToken cancellationToken = default) =>
        await _db.PolicyTypes.AsNoTracking()
            .OrderBy(pt => pt.Code)
            .Select(pt => new PolicyTypeResponse(
                pt.Id, pt.Code, pt.Name, pt.Description, pt.BaseRate, Tariff.Currency))
            .ToListAsync(cancellationToken);
}
