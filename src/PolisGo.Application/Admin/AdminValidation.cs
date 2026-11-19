namespace PolisGo.Application.Admin;

// Rules for the admin panel's endpoints. Messages are stable English strings
// the SPA maps to translations (a contract test reads this file); change both
// sides together.
public static class AdminValidation
{
    public const int MaxRangeMonths = 24;
    public const int MaxSearchLength = 100;

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
    }
}
