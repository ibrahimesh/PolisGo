namespace PolisGo.Application.Diagnostics;

// Messages the System section's API can answer with. The SPA maps each to a
// translation (i18n/apiErrors.test.ts reads this file).
public static class ErrorTrackingValidation
{
    public const int NoteMaxLength = 1000;
    public const int MaxPurgeDays = 3650;

    public static class Messages
    {
        public const string NoteTooLong = "The note can be at most 1000 characters.";
        public const string PurgeDaysRange = "Choose between 1 and 3650 days.";
        public const string ReferenceInvalid = "Enter a Reference such as 8F05E497, or a full trace id.";
        public const string ReferenceNotFound = "No error has this Reference. It may be older than the retention period.";
        // 409s from ErrorGroup's own transitions (the Domain can't reference
        // these; ErrorGroupEntityTests pins the wording).
        public const string AlreadyResolved = "This error is already resolved.";
        public const string AlreadyIgnored = "This error is already ignored.";
        public const string AlreadyOpen = "This error is already open.";
    }
}
