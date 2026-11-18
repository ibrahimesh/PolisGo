using System.Text.RegularExpressions;

namespace PolisGo.Application.Vehicles;

// Vehicle rules shared with the SPA (frontend/src/features/vehicles/
// vehicleSchema.ts). Lengths match VehicleConfiguration: without these checks
// an over-long plate or VIN passed validation and failed on SQL Server as a
// 500 (SQLite ignores column lengths, so the tests never saw it). Messages are
// stable English strings the SPA maps to translations; change both together.
public static partial class VehicleValidation
{
    public const int MakeMaxLength = 64;
    public const int ModelMaxLength = 64;
    public const int PlateMaxLength = 16;
    public const int VinLength = 17;
    public const int MinYear = 1950;
    public const int MaxEngineCapacityCc = 10_000;

    public static class Messages
    {
        public const string MakeRequired = "Make is required.";
        public const string MakeTooLong = "Make must be 64 characters or fewer.";
        public const string ModelRequired = "Model is required.";
        public const string ModelTooLong = "Model must be 64 characters or fewer.";
        public const string PlateRequired = "Plate number is required.";
        public const string PlateInvalid = "Plate number must be up to 16 letters, digits, spaces or hyphens.";
        public const string VinRequired = "VIN is required.";
        public const string VinInvalid = "VIN must be 17 characters: digits and letters except I, O and Q.";
        public const string YearOutOfRange = "Model year must be between 1950 and next year.";
        public const string EngineCapacityPositive = "Engine capacity must be greater than zero.";
        public const string EngineCapacityTooLarge = "Engine capacity must be 10000 cc or less.";
    }

    // Letters and digits, optionally separated by single spaces or hyphens
    // ("10-AA-123", "90 BB 456"). Checked after upper-casing.
    [GeneratedRegex(@"^[A-Z0-9]+([ -][A-Z0-9]+)*$")]
    private static partial Regex PlatePattern();

    // ISO 3779: 17 characters, I, O and Q excluded (they read as 1 and 0).
    [GeneratedRegex(@"^[A-HJ-NPR-Z0-9]{17}$")]
    private static partial Regex VinPattern();

    public static string NormalizePlate(string? plate) => (plate ?? string.Empty).Trim().ToUpperInvariant();
    public static string NormalizeVin(string? vin) => (vin ?? string.Empty).Trim().ToUpperInvariant();

    public static string? MakeError(string? make) =>
        string.IsNullOrWhiteSpace(make) ? Messages.MakeRequired
        : make.Trim().Length > MakeMaxLength ? Messages.MakeTooLong
        : null;

    public static string? ModelError(string? model) =>
        string.IsNullOrWhiteSpace(model) ? Messages.ModelRequired
        : model.Trim().Length > ModelMaxLength ? Messages.ModelTooLong
        : null;

    public static string? PlateError(string? plate)
    {
        if (string.IsNullOrWhiteSpace(plate)) return Messages.PlateRequired;
        var normalized = NormalizePlate(plate);
        return normalized.Length <= PlateMaxLength && PlatePattern().IsMatch(normalized)
            ? null
            : Messages.PlateInvalid;
    }

    public static string? VinError(string? vin) =>
        string.IsNullOrWhiteSpace(vin) ? Messages.VinRequired
        : VinPattern().IsMatch(NormalizeVin(vin)) ? null
        : Messages.VinInvalid;

    public static string? YearError(int year, int currentYear) =>
        year < MinYear || year > currentYear + 1 ? Messages.YearOutOfRange : null;

    public static string? EngineCapacityError(int engineCapacityCc) =>
        engineCapacityCc <= 0 ? Messages.EngineCapacityPositive
        : engineCapacityCc > MaxEngineCapacityCc ? Messages.EngineCapacityTooLarge
        : null;
}
