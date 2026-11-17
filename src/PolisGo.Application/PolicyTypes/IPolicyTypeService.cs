using PolisGo.Application.PolicyTypes.Dtos;

namespace PolisGo.Application.PolicyTypes;

public interface IPolicyTypeService
{
    Task<IReadOnlyList<PolicyTypeResponse>> ListAsync(CancellationToken cancellationToken = default);
}
