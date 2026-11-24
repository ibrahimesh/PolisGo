using PolisGo.Application.Diagnostics.Dtos;

namespace PolisGo.Application.Abstractions;

// A live look at the database for the health page: a round trip and the
// migration state. Never throws; an unreachable database is a result.
public interface IDatabaseProbe
{
    Task<DatabaseHealth> ProbeAsync(CancellationToken cancellationToken = default);
}
