using PolisGo.Domain.Enums;
using PolisGo.Domain.Exceptions;

namespace PolisGo.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public UserRole Role { get; set; }
    public DateTime CreatedAt { get; set; }

    // A deactivated account can't sign in, and its tokens stop working.
    public bool IsActive { get; set; } = true;
    public DateTime? DeactivatedAt { get; set; }

    // Carried in every token and checked on each request: changing it
    // (deactivation, role change) ends every session issued before.
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    // Back-navigation: a user may own a customer profile (one-to-one, optional).
    public Customer? Customer { get; set; }

    // Policies this user handles as an agent.
    public ICollection<Policy> HandledPolicies { get; set; } = new List<Policy>();

    // Claims this user handles as an adjuster.
    public ICollection<Claim> AssignedClaims { get; set; } = new List<Claim>();

    public bool IsStaff => Role is UserRole.Agent or UserRole.Adjuster or UserRole.Admin;

    public void Deactivate(DateTime at)
    {
        if (!IsActive)
        {
            throw new InvalidStateTransitionException($"{Email} is already deactivated.");
        }
        IsActive = false;
        DeactivatedAt = at;
        SecurityStamp = Guid.NewGuid();
    }

    public void Reactivate()
    {
        if (IsActive)
        {
            throw new InvalidStateTransitionException($"{Email} is already active.");
        }
        IsActive = true;
        DeactivatedAt = null;
    }

    // Staff roles only: a client account is not turned into staff here.
    public void ChangeRole(UserRole role)
    {
        if (!IsStaff || role is UserRole.Client)
        {
            throw new InvalidStateTransitionException("Only staff roles can be changed, and only to staff roles.");
        }
        if (Role == role)
        {
            throw new InvalidStateTransitionException($"{Email} already has the role {role}.");
        }
        Role = role;
        // The role is in the token; old tokens must not keep the old one.
        SecurityStamp = Guid.NewGuid();
    }
}
