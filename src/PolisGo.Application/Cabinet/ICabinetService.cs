using PolisGo.Application.Cabinet.Dtos;

namespace PolisGo.Application.Cabinet;

// The client cabinet's read models. Every method is scoped to the calling
// Client's own customer record; the only ids a caller passes are the policy or
// claim being marked read, which go through PolicyAccess / ClaimAccess.
public interface ICabinetService
{
    Task<ClientOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReminderResponse>> GetRemindersAsync(CancellationToken cancellationToken = default);
    Task MarkReminderReadAsync(Guid policyId, CancellationToken cancellationToken = default);
    Task MarkAllRemindersReadAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ClaimUpdateResponse>> GetClaimUpdatesAsync(CancellationToken cancellationToken = default);
    Task MarkClaimUpdateReadAsync(Guid claimId, CancellationToken cancellationToken = default);
    Task MarkAllClaimUpdatesReadAsync(CancellationToken cancellationToken = default);
}
