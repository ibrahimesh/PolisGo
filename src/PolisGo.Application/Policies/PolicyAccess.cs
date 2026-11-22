using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Policies;

// Single source of truth for "which policies can the caller see" and "which
// can they act on" — shared by PolicyService, ClaimService and the customer
// directory so the rule can't drift.
internal static class PolicyAccess
{
    public static IQueryable<Policy> VisibleTo(
        IQueryable<Policy> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Client => currentUser.CustomerId.HasValue
            ? query.Where(p => p.CustomerId == currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        // What they sold (kept after the customer moves on), plus every
        // policy of a customer now in their book, whoever sold it.
        UserRole.Agent => query.Where(p =>
            p.AgentId == currentUser.UserId || p.Customer.AgentId == currentUser.UserId),
        // Only through a claim they can work on (the open queue or their own),
        // the same reach as CustomerAccess gives them.
        UserRole.Adjuster => query.Where(p => p.Claims.Any(c =>
            c.AssignedAdjusterId == null || c.AssignedAdjusterId == currentUser.UserId)),
        _ => query // Admin
    };

    // Paying, cancelling and filing a claim. An agent acts only for a
    // customer in their current book; a policy they sold to someone who has
    // since moved to another agent is read-only for them. Adjusters never.
    public static IQueryable<Policy> WritableBy(
        IQueryable<Policy> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Agent => query.Where(p => p.Customer.AgentId == currentUser.UserId),
        UserRole.Adjuster => query.Where(_ => false),
        _ => VisibleTo(query, currentUser)
    };
}
