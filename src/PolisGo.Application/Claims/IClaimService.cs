using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common;

namespace PolisGo.Application.Claims;

public interface IClaimService
{
    Task<ClaimResponse> SubmitAsync(SubmitClaimRequest request, CancellationToken cancellationToken = default);

    Task<ClaimDetailResponse> GetByIdAsync(Guid claimId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ClaimHistoryEntry>> GetHistoryAsync(Guid claimId, CancellationToken cancellationToken = default);

    Task<PagedResult<ClaimResponse>> ListAsync(ListClaimsFilter filter, CancellationToken cancellationToken = default);

    // Every row the list would page through, for the CSV export (capped).
    Task<IReadOnlyList<ClaimResponse>> ExportAsync(ListClaimsFilter filter, CancellationToken cancellationToken = default);

    Task<ClaimResponse> ReviewAsync(Guid claimId, ReviewClaimRequest request, CancellationToken cancellationToken = default);

    Task<ClaimResponse> ApproveAsync(Guid claimId, ApproveClaimRequest request, CancellationToken cancellationToken = default);

    Task<ClaimResponse> RejectAsync(Guid claimId, RejectClaimRequest request, CancellationToken cancellationToken = default);

    Task<ClaimResponse> PayAsync(Guid claimId, PayClaimRequest request, CancellationToken cancellationToken = default);

    Task<ClaimResponse> WithdrawAsync(Guid claimId, WithdrawClaimRequest request, CancellationToken cancellationToken = default);
}
