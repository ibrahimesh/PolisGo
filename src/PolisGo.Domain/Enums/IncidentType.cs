namespace PolisGo.Domain.Enums;

// What happened, as the customer reports it. Stored as a string; older claims
// filed before the field existed have none.
public enum IncidentType
{
    Collision,
    Theft,
    Vandalism,
    Fire,
    NaturalHazard,
    Glass,
    Other
}
