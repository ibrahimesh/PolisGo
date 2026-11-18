namespace PolisGo.Application.Policies;

// Purchase rules the SPA mirrors in its wizard schema. Messages are stable
// English strings the SPA maps to translations (a contract test reads this
// file); change both sides together.
public static class PolicyValidation
{
    public const int MinTermMonths = 1;
    public const int MaxTermMonths = 12;
    public const int StartDateHorizonDays = 60;
    public const int MaxSearchLength = 100;

    public static class Messages
    {
        public const string StartDateInPast = "Start date cannot be in the past.";
        public const string StartDateTooFar = "Start date cannot be more than 60 days in the future.";
        public const string TermOutOfRange = "Term must be between 1 and 12 months.";
        public const string PolicyTypeRequired = "Policy type is required.";
        public const string VehicleRequired = "Vehicle is required.";
        public const string SearchTooLong = "Search must be at most 100 characters.";
        public const string Overlap =
            "An active or draft policy of this type already covers the vehicle in the chosen period.";
        public const string DraftStartPassed =
            "The start date of this draft has passed. Start a new purchase to choose a new date.";
        public const string AlreadyExpired = "This policy has already expired.";
    }
}
