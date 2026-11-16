using PolisGo.Application.Common;
using PolisGo.Application.Policies.Dtos;

namespace PolisGo.Application.Policies;

public interface IPolicyService
{
    Task<PolicyResponse> CreateAsync(
        CreatePolicyRequest request,
        CancellationToken cancellationToken = default);

    Task<PolicyResponse> GetByIdAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<PolicyResponse>> ListAsync(
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<PayPolicyResponse> PayAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);

    Task<PolicyResponse> CancelAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);
}
