using PolisGo.Domain.Enums;

namespace PolisGo.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public UserRole Role { get; set; }
    public DateTime CreatedAt { get; set; }

    // Back-navigation: a user may own a customer profile (one-to-one, optional).
    public Customer? Customer { get; set; }

    // Policies this user handles as an agent.
    public ICollection<Policy> HandledPolicies { get; set; } = new List<Policy>();

    // Claims this user handles as an adjuster.
    public ICollection<Claim> AssignedClaims { get; set; } = new List<Claim>();
}
