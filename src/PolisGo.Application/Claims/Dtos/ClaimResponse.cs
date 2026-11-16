using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims.Dtos;

public record ClaimResponse(
    Guid Id,
    string ClaimNumber,
    Guid PolicyId,
    string PolicyNumber,
    DateTime IncidentDate,
    string Description,
    decimal ClaimedAmount,
    decimal? ApprovedAmount,
    ClaimStatus Status,
    Guid? AssignedAdjusterId,
    DateTime CreatedAt
);

public record ClaimHistoryEntry(
    Guid Id,
    ClaimStatus? FromStatus,
    ClaimStatus ToStatus,
    Guid ChangedByUserId,
    string Comment,
    DateTime ChangedAt
);

public record ClaimDocumentResponse(
    Guid Id,
    string FileName,
    DateTime UploadedAt
);

public record ClaimDetailResponse(
    ClaimResponse Claim,
    IReadOnlyList<ClaimHistoryEntry> History,
    IReadOnlyList<ClaimDocumentResponse> Documents
);
