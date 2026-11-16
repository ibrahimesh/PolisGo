using PolisGo.Application.Abstractions;
using PolisGo.Domain.Enums;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Application.Claims;

// Single source of truth for "which claims can the caller see" — used by both
// ClaimService and the document endpoints so authorization can't drift.
internal static class ClaimAccess
{
    public static IQueryable<DomainClaim> VisibleTo(
        IQueryable<DomainClaim> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Client => currentUser.CustomerId.HasValue
            ? query.Where(c => c.Policy.CustomerId == currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        UserRole.Agent => query.Where(c => c.Policy.AgentId == currentUser.UserId),
        UserRole.Adjuster => query.Where(c =>
            c.AssignedAdjusterId == null || c.AssignedAdjusterId == currentUser.UserId),
        _ => query // Admin
    };
}
