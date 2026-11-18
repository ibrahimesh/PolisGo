namespace PolisGo.Application.Claims;

// Claim rules the SPA mirrors in its claim wizard. Messages are stable English
// strings the SPA maps to translations (a contract test reads this file);
// change both sides together.
public static class ClaimValidation
{
    public const int MinDescriptionLength = 10;
    public const int MaxDescriptionLength = 2000;
    public const int MinLocationLength = 3;
    public const int MaxLocationLength = 200;
    // Withdrawal reasons and staff comments share the history Comment column
    // (1000); the customer's reason is kept shorter on purpose.
    public const int MaxReasonLength = 500;
    public const int MaxCommentLength = 1000;
    public const int MaxSearchLength = 100;

    public const long MaxFileSizeBytes = 5 * 1024 * 1024;
    public const int MaxDocumentsPerClaim = 10;

    public static class Messages
    {
        public const string PolicyNotActive = "Claims can only be filed on active policies.";
        public const string IncidentDateInFuture = "Incident date cannot be in the future.";
        public const string IncidentDateOutsideCover = "Incident date must fall within the policy period.";
        public const string IncidentTypeRequired = "Incident type is required.";
        public const string LocationLength = "Location must be between 3 and 200 characters.";
        public const string DescriptionLength = "Description must be between 10 and 2000 characters.";
        public const string AmountNotPositive = "Claimed amount must be greater than zero.";
        public const string AmountTooHigh = "Claimed amount is above the limit for an online claim.";
        public const string AmountPrecision = "Claimed amount can have at most two decimal places.";
        public const string Duplicate = "A claim for this policy, incident date and amount is already on file.";
        public const string ReasonTooLong = "Reason must be at most 500 characters.";
        public const string CommentTooLong = "Comment must be at most 1000 characters.";
        public const string SearchTooLong = "Search must be at most 100 characters.";
        public const string RejectionReasonRequired = "A rejection reason is required.";
        public const string ApprovedAmountNotPositive = "Approved amount must be greater than zero.";
        public const string ApprovedAmountPrecision = "Approved amount can have at most two decimal places.";
        public const string ApprovedAmountAboveClaimed = "Approved amount cannot exceed the claimed amount.";

        public const string FileRequired = "File is required.";
        public const string FileSize = "File size must be between 1 byte and 5 MB.";
        public const string FileType = "Only .jpg, .jpeg, .png and .pdf files are accepted.";
        public const string FileContentMismatch = "File content does not match the declared extension.";
        public const string TooManyDocuments = "A claim can have at most 10 documents.";
        public const string ClaimClosed = "Documents can only be added while the claim is open.";
    }
}
