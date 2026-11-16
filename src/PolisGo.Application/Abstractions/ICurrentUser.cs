using PolisGo.Domain.Enums;

namespace PolisGo.Application.Abstractions;

// Supplied by the composition root (Api) from the authenticated claims. Keeps
// Application and Infrastructure free of ASP.NET Core / HttpContext knowledge.
public interface ICurrentUser
{
    Guid UserId { get; }
    UserRole Role { get; }

    // Populated for Clients from the JWT; null for staff accounts that do not
    // have a linked Customer profile.
    Guid? CustomerId { get; }
}
