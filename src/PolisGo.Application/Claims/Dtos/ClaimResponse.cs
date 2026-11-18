using PolisGo.Application.Policies.Dtos;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims.Dtos;

public record ClaimResponse(
    Guid Id,
    string ClaimNumber,
    Guid PolicyId,
    string PolicyNumber,
    string PolicyTypeCode,
    DateTime IncidentDate,
    // Null on claims filed before these were collected.
    IncidentType? IncidentType,
    string? Location,
    string Description,
    decimal ClaimedAmount,
    decimal? ApprovedAmount,
    ClaimStatus Status,
    Guid? AssignedAdjusterId,
    DateTime CreatedAt,
    // The latest status change (CreatedAt when there is none yet).
    DateTime UpdatedAt,
    Guid CustomerId,
    string CustomerName,
    string? AssignedAdjusterName,
    // Send it back with a decision: a different value on the server means
    // someone else changed the claim in between (409 "Concurrent update").
    Guid RowVersion
);

public record ClaimHistoryEntry(
    Guid Id,
    ClaimStatus? FromStatus,
    ClaimStatus ToStatus,
    Guid ChangedByUserId,
    // Who made the change, so a customer can tell their own steps from staff ones.
    UserRole ChangedByRole,
    string ChangedByName,
    string Comment,
    DateTime ChangedAt
);

public record ClaimDocumentResponse(
    Guid Id,
    string FileName,
    // From the extension, which the upload checked against the file's bytes.
    string ContentType,
    DateTime UploadedAt
);

public record ClaimPolicySummary(
    Guid Id,
    string PolicyNumber,
    string PolicyTypeCode,
    DateOnly StartDate,
    DateOnly EndDate,
    PolicyVehicleSummary Vehicle
);

public record ClaimCustomerSummary(
    Guid Id,
    string FullName,
    string Email,
    string Phone
);

public record ClaimDetailResponse(
    ClaimResponse Claim,
    ClaimPolicySummary Policy,
    ClaimCustomerSummary Customer,
    // Oldest first.
    IReadOnlyList<ClaimHistoryEntry> History,
    IReadOnlyList<ClaimDocumentResponse> Documents,
    // What the caller may do now; the endpoints enforce the same rules.
    bool CanWithdraw,
    bool CanAddDocuments,
    int MaxDocuments,
    // Every action the caller's role has, allowed or not, with the reason
    // (a ClaimActionBlock code) when not.
    IReadOnlyList<ClaimActionState> Actions
);
