using PolisGo.Application.Cabinet.Dtos;

namespace PolisGo.Application.Cabinet;

// The client cabinet's read models. Every method is scoped to the calling
// Client's own customer record; there is no id to tamper with except the
// policy being marked read, which goes through PolicyAccess.
public interface ICabinetService
{
    Task<ClientOverviewResponse> GetOverviewAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReminderResponse>> GetRemindersAsync(CancellationToken cancellationToken = default);
    Task MarkReminderReadAsync(Guid policyId, CancellationToken cancellationToken = default);
    Task MarkAllRemindersReadAsync(CancellationToken cancellationToken = default);
}
