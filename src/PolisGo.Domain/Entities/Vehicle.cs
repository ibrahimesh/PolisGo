namespace PolisGo.Domain.Entities;

public class Vehicle
{
    public Guid Id { get; set; }

    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;

    public string Make { get; set; } = null!;
    public string Model { get; set; } = null!;
    public int Year { get; set; }

    // Engine displacement in cubic centimeters — common input for MTPL pricing.
    public int EngineCapacityCc { get; set; }

    public string PlateNumber { get; set; } = null!;
    public string Vin { get; set; } = null!;

    public ICollection<Policy> Policies { get; set; } = new List<Policy>();
}
