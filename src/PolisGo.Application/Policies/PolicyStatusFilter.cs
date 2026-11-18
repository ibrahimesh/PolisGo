using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies;

// SQL form of Policy.StatusOn: filters by the status a user sees, not the one
// stored. Plain DateTime comparisons against a parameter, so it translates on
// SQL Server and SQLite alike.
internal static class PolicyStatusFilter
{
    public static IQueryable<Policy> WhereEffectiveStatus(
        this IQueryable<Policy> query, PolicyStatus status, DateOnly today)
    {
        var startOfToday = today.ToDateTime(TimeOnly.MinValue);
        return status switch
        {
            PolicyStatus.Active => query.Where(p => p.Status == PolicyStatus.Active && p.EndDate >= startOfToday),
            PolicyStatus.Expired => query.Where(p =>
                p.Status == PolicyStatus.Expired
                || (p.Status == PolicyStatus.Active && p.EndDate < startOfToday)),
            _ => query.Where(p => p.Status == status)
        };
    }
}
