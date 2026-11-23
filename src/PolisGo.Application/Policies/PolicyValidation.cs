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
        // Cover bought today starts tomorrow: a same-day start would pay for an
        // accident that happened before the purchase.
        public const string StartDateTooEarly = "Cover can start tomorrow at the earliest.";
        public const string StartDateTooFar = "Start date cannot be more than 60 days in the future.";
        public const string TermOutOfRange = "Term must be between 1 and 12 months.";
        public const string PolicyTypeRequired = "Policy type is required.";
        public const string VehicleRequired = "Vehicle is required.";
        public const string SearchTooLong = "Search must be at most 100 characters.";
        public const string Overlap =
            "An active or draft policy of this type already covers the vehicle in the chosen period.";
        public const string DraftStartPassed =
            "This draft can no longer start on its date: cover starts tomorrow at the earliest. Start a new purchase to choose a new date.";
        public const string AlreadyExpired = "This policy has already expired.";
    }
}
