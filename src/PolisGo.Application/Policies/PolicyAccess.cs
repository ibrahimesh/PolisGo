using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies;

// Single source of truth for "which policies can the caller see" — shared by
// PolicyService and the customer directory so the rule can't drift.
internal static class PolicyAccess
{
    public static IQueryable<Policy> VisibleTo(
        IQueryable<Policy> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Client => currentUser.CustomerId.HasValue
            ? query.Where(p => p.CustomerId == currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        UserRole.Agent => query.Where(p => p.AgentId == currentUser.UserId),
        // Only through a claim they can work on (the open queue or their own),
        // the same reach as CustomerAccess gives them.
        UserRole.Adjuster => query.Where(p => p.Claims.Any(c =>
            c.AssignedAdjusterId == null || c.AssignedAdjusterId == currentUser.UserId)),
        _ => query // Admin
    };
}
