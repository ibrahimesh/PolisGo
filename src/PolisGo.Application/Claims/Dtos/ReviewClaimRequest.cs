namespace PolisGo.Application.Claims.Dtos;

// RowVersion: the claim's rowVersion as the caller last saw it. Optional for
// older clients; when sent and stale, the decision is a 409 "Concurrent update".
public record ReviewClaimRequest(string? Comment, Guid? RowVersion = null);
public record ApproveClaimRequest(decimal ApprovedAmount, string? Comment, Guid? RowVersion = null);
public record RejectClaimRequest(string? Comment, Guid? RowVersion = null);
public record PayClaimRequest(string? Comment, Guid? RowVersion = null);
public record WithdrawClaimRequest(string? Reason);
