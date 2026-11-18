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
    DateTime UpdatedAt
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

public record ClaimDetailResponse(
    ClaimResponse Claim,
    ClaimPolicySummary Policy,
    // Oldest first.
    IReadOnlyList<ClaimHistoryEntry> History,
    IReadOnlyList<ClaimDocumentResponse> Documents,
    // What the caller may do now; the endpoints enforce the same rules.
    bool CanWithdraw,
    bool CanAddDocuments,
    int MaxDocuments
);
