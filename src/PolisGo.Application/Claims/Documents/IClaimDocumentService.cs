using PolisGo.Application.Claims.Dtos;

namespace PolisGo.Application.Claims.Documents;

public record ClaimDocumentDownload(Stream Content, string FileName, string ContentType);

public interface IClaimDocumentService
{
    Task<ClaimDocumentResponse> UploadAsync(
        Guid claimId,
        Stream content,
        string originalFileName,
        long contentLength,
        CancellationToken cancellationToken = default);

    Task<ClaimDocumentDownload> DownloadAsync(
        Guid claimId,
        Guid documentId,
        CancellationToken cancellationToken = default);
}
