using PolisGo.Application.Statistics.Dtos;

namespace PolisGo.Application.Statistics;

public interface IAdminStatsService
{
    Task<AdminStatsResponse> GetAsync(CancellationToken cancellationToken = default);
}
