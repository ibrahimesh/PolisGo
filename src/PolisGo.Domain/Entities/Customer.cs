namespace PolisGo.Domain.Entities;

public class Customer
{
    public Guid Id { get; set; }

    // Nullable: walk-in customers may not yet have a User login account.
    public Guid? UserId { get; set; }
    public User? User { get; set; }

    public string FullName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Phone { get; set; } = null!;
    public DateTime BirthDate { get; set; }
    public DateTime DrivingLicenseDate { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Vehicle> Vehicles { get; set; } = new List<Vehicle>();
    public ICollection<Policy> Policies { get; set; } = new List<Policy>();
}
