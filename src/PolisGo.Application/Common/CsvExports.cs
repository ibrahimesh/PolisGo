using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Policies.Dtos;
using PolisGo.Application.Pricing;

namespace PolisGo.Application.Common;

// Column layout of the staff exports. Headers and enum values stay in English
// so a file reads the same whichever language the UI was in; names, places
// and descriptions are kept exactly as entered (Cyrillic and Azerbaijani too).
public static class CsvExports
{
    public static byte[] Claims(IEnumerable<ClaimResponse> claims) => Csv.Write(
        [
            "Claim number", "Status", "Customer", "Policy number", "Product", "Incident date",
            "Incident type", "Location", "Claimed amount", "Approved amount", "Currency",
            "Filed at (UTC)", "Updated at (UTC)", "Adjuster"
        ],
        claims.Select(c => (IReadOnlyList<string>)
        [
            Csv.Text(c.ClaimNumber),
            Csv.Text(c.Status.ToString()),
            Csv.Text(c.CustomerName),
            Csv.Text(c.PolicyNumber),
            Csv.Text(c.PolicyTypeCode),
            Csv.Date(DateOnly.FromDateTime(c.IncidentDate)),
            Csv.Text(c.IncidentType?.ToString()),
            Csv.Text(c.Location),
            Csv.Number(c.ClaimedAmount),
            Csv.Number(c.ApprovedAmount),
            Csv.Text(Tariff.Currency),
            Csv.Timestamp(c.CreatedAt),
            Csv.Timestamp(c.UpdatedAt),
            Csv.Text(c.AssignedAdjusterName)
        ]));

    public static byte[] Policies(IEnumerable<PolicyResponse> policies) => Csv.Write(
        [
            "Policy number", "Status", "Customer", "Product", "Vehicle", "Plate",
            "Start date", "End date", "Premium", "Currency", "Created at (UTC)", "Agent"
        ],
        policies.Select(p => (IReadOnlyList<string>)
        [
            Csv.Text(p.PolicyNumber),
            Csv.Text(p.Status.ToString()),
            Csv.Text(p.CustomerName),
            Csv.Text(p.PolicyTypeCode),
            Csv.Text($"{p.Vehicle.Make} {p.Vehicle.Model} {p.Vehicle.Year}"),
            Csv.Text(p.Vehicle.PlateNumber),
            Csv.Date(p.StartDate),
            Csv.Date(p.EndDate),
            Csv.Number(p.Premium),
            Csv.Text(p.Currency),
            Csv.Timestamp(p.CreatedAt),
            Csv.Text(p.AgentName)
        ]));
}
