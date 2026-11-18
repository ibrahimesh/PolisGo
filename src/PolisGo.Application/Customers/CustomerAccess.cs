using PolisGo.Application.Abstractions;
using PolisGo.Domain.Entities;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Customers;

// Single source of truth for "which customers can the caller see": the
// directory, staff vehicle reads and selling on a customer's behalf all use it.
// A customer outside the scope is a 404, as with policies and claims.
internal static class CustomerAccess
{
    public static IQueryable<Customer> VisibleTo(
        IQueryable<Customer> query, ICurrentUser currentUser) => currentUser.Role switch
    {
        UserRole.Client => currentUser.CustomerId.HasValue
            ? query.Where(c => c.Id == currentUser.CustomerId!.Value)
            : query.Where(_ => false),
        // Their own book only, never another agent's.
        UserRole.Agent => query.Where(c => c.AgentId == currentUser.UserId),
        // Only people whose claims are in the adjuster's reach (the open queue
        // or their own), not the agents' customer books.
        UserRole.Adjuster => query.Where(c => c.Policies.Any(p => p.Claims.Any(cl =>
            cl.AssignedAdjusterId == null || cl.AssignedAdjusterId == currentUser.UserId))),
        _ => query // Admin
    };
}
