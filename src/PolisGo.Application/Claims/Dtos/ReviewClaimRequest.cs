namespace PolisGo.Application.Claims.Dtos;

public record ReviewClaimRequest(string? Comment);
public record ApproveClaimRequest(decimal ApprovedAmount, string Comment);
public record RejectClaimRequest(string Comment);
public record PayClaimRequest(string? Comment);
