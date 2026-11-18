using PolisGo.Application.Common;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;

namespace PolisGo.Application.Policies;

public interface IPolicyService
{
    // Prices a prospective policy from stored customer, vehicle and claims
    // data — the same path Create uses, so the quote is the price charged.
    Task<PremiumBreakdown> QuoteAsync(
        CreatePolicyRequest request,
        CancellationToken cancellationToken = default);

    Task<PolicyResponse> CreateAsync(
        CreatePolicyRequest request,
        CancellationToken cancellationToken = default);

    Task<PolicyResponse> GetByIdAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);

    Task<PolicyDetailResponse> GetDetailAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<PolicyResponse>> ListAsync(
        ListPoliciesQuery query,
        CancellationToken cancellationToken = default);

    Task<PayPolicyResponse> PayAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);

    Task<PolicyResponse> CancelAsync(
        Guid policyId,
        CancellationToken cancellationToken = default);
}
