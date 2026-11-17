namespace PolisGo.Application.PolicyTypes.Dtos;

// Public catalogue entry. Code is the stable key clients use for lookups and
// translations; Name/Description are the catalogue's own English copy.
public record PolicyTypeResponse(
    Guid Id,
    string Code,
    string Name,
    string Description,
    // Starting rate before pricing factors; the same value the quote
    // calculator returns as BaseRate.
    decimal BaseRate,
    string Currency
);
