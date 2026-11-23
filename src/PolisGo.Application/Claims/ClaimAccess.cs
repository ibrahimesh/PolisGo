using PolisGo.Application.Abstractions;
using PolisGo.Domain.Enums;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Application.Claims;

// Single source of truth for "which claims can the caller see" and "which can
// they act on" — used by ClaimService and the document endpoints so
// authorization can't drift.
internal static class ClaimAccess
{
    public static IQueryable<DomainClaim> VisibleTo(
        IQueryable<DomainClaim> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Client => currentUser.CustomerId.HasValue
            ? query.Where(c => c.Policy.CustomerId == currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        // Claims on what they sold, and on every policy of their book.
        UserRole.Agent => query.Where(c =>
            c.Policy.AgentId == currentUser.UserId || c.Policy.Customer.AgentId == currentUser.UserId),
        UserRole.Adjuster => query.Where(c =>
            c.AssignedAdjusterId == null || c.AssignedAdjusterId == currentUser.UserId),
        _ => query // Admin
    };

    // Withdrawing and adding documents. An agent acts only for a customer in
    // their current book; everyone else as far as they can see.
    public static IQueryable<DomainClaim> WritableBy(
        IQueryable<DomainClaim> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Agent => query.Where(c => c.Policy.Customer.AgentId == currentUser.UserId),
        _ => VisibleTo(query, currentUser)
    };
}
