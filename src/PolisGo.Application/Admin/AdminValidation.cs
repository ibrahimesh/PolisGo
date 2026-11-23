namespace PolisGo.Application.Admin;

// Rules for the admin panel's endpoints. Messages are stable English strings
// the SPA maps to translations (a contract test reads this file); change both
// sides together.
public static class AdminValidation
{
    public const int MaxRangeMonths = 24;
    public const int MaxSearchLength = 100;

    // Report filters stay inside these days: past them the date arithmetic
    // (a month back, the day after) leaves DateOnly's range and threw a 500.
    public static readonly DateOnly EarliestDate = new(2000, 1, 1);
    public static readonly DateOnly LatestDate = new(2100, 12, 31);

    // Throws a field error for a date outside the window.
    public static void EnsureInRange(DateOnly? from, DateOnly? to)
    {
        var errors = new Dictionary<string, string[]>();
        if (from is { } f && (f < EarliestDate || f > LatestDate)) errors["from"] = [Messages.DateOutOfRange];
        if (to is { } t && (t < EarliestDate || t > LatestDate)) errors["to"] = [Messages.DateOutOfRange];
        if (errors.Count > 0) throw new PolisGo.Application.Common.Exceptions.ValidationException(errors);
    }

    public static class Messages
    {
        public const string RoleInvalid = "Role must be Agent, Adjuster or Admin.";
        public const string NotYourself = "You can't deactivate your own account or change your own role.";
        public const string LastAdmin = "At least one active administrator must remain.";
        public const string AlreadyInactive = "This account is already deactivated.";
        public const string AlreadyActive = "This account is already active.";
        public const string SameRole = "The account already has this role.";
        public const string RangeOrder = "The start of the range must be on or before its end.";
        public const string RangeTooLong = "The range can be at most 24 months.";
        public const string SearchTooLong = "Search must be at most 100 characters.";
        public const string DateOutOfRange = "Dates must be between 1 January 2000 and 31 December 2100.";
    }
}
