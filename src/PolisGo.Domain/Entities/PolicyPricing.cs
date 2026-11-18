namespace PolisGo.Domain.Entities;

// The tariff factors a policy was priced with, frozen at issue. Recomputing
// later would be wrong: the customer's age, experience and claims change, and
// so may the tariff. Owned by Policy; null for policies issued before it existed.
public class PolicyPricing
{
    public decimal BaseRate { get; set; }
    public decimal EngineFactor { get; set; }
    public decimal DriverAgeFactor { get; set; }
    public decimal ExperienceFactor { get; set; }
    public decimal VehicleAgeFactor { get; set; }
    public decimal BonusMalusFactor { get; set; }
    public decimal TermFactor { get; set; }
    public decimal TotalFactor { get; set; }
}
