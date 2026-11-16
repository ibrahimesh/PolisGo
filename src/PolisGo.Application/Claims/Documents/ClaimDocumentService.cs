using Microsoft.EntityFrameworkCore;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Claims.Dtos;
using PolisGo.Application.Common.Exceptions;
using PolisGo.Domain.Entities;
using DomainClaim = PolisGo.Domain.Entities.Claim;

namespace PolisGo.Application.Claims.Documents;

public class ClaimDocumentService : IClaimDocumentService
{
    public const long MaxFileSizeBytes = 5 * 1024 * 1024;
    public const int MaxDocumentsPerClaim = 10;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".pdf"
    };

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly IFileStorage _storage;

    public ClaimDocumentService(
        IApplicationDbContext db, ICurrentUser currentUser, IFileStorage storage)
    {
        _db = db;
        _currentUser = currentUser;
        _storage = storage;
    }

    public async Task<ClaimDocumentResponse> UploadAsync(
        Guid claimId,
        Stream content,
        string originalFileName,
        long contentLength,
        CancellationToken cancellationToken = default)
    {
        // Ownership check — throws 404 if the caller can't see this claim.
        var claim = await LoadVisibleAsync(claimId, cancellationToken);

        // Count guard against the 10-documents ceiling.
        var currentCount = await _db.ClaimDocuments
            .CountAsync(d => d.ClaimId == claim.Id, cancellationToken);
        if (currentCount >= MaxDocumentsPerClaim)
        {
            throw new ConflictException(
                $"A claim can have at most {MaxDocumentsPerClaim} documents.");
        }

        if (contentLength <= 0 || contentLength > MaxFileSizeBytes)
        {
            throw new ValidationException("file",
                $"File size must be between 1 byte and {MaxFileSizeBytes / (1024 * 1024)} MB.");
        }

        // GetFileName strips any directory components a client might have tried
        // to sneak in (../../secret.pdf becomes secret.pdf).
        var safeDisplayName = Path.GetFileName(originalFileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(safeDisplayName))
        {
            throw new ValidationException("file", "File name is required.");
        }

        var extension = Path.GetExtension(safeDisplayName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
        {
            throw new ValidationException("file",
                "Only .jpg, .jpeg, .png and .pdf files are accepted.");
        }

        // Magic-byte check: don't trust the extension alone. A .pdf that is
        // really an .exe would be caught here.
        var magic = await ReadHeaderAsync(content, cancellationToken);
        if (!IsDeclaredTypeMatchingHeader(extension, magic))
        {
            throw new ValidationException("file",
                "File content does not match the declared extension.");
        }

        var storageKey = await _storage.SaveAsync(content, extension, cancellationToken);

        var document = new ClaimDocument
        {
            Id = Guid.NewGuid(),
            ClaimId = claim.Id,
            FileName = safeDisplayName,
            StoragePath = storageKey,
            UploadedAt = DateTime.UtcNow
        };
        _db.ClaimDocuments.Add(document);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Orphan cleanup: the file is on disk but the row never landed.
            // Best-effort delete; failure here is logged by the middleware.
            await _storage.DeleteAsync(storageKey, CancellationToken.None);
            throw;
        }

        return new ClaimDocumentResponse(document.Id, document.FileName, document.UploadedAt);
    }

    public async Task<ClaimDocumentDownload> DownloadAsync(
        Guid claimId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var claim = await LoadVisibleAsync(claimId, cancellationToken);

        var document = await _db.ClaimDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.ClaimId == claim.Id, cancellationToken)
            ?? throw new NotFoundException(nameof(ClaimDocument), documentId);

        var stream = await _storage.OpenReadAsync(document.StoragePath, cancellationToken);
        var contentType = ContentTypeFor(Path.GetExtension(document.FileName));
        return new ClaimDocumentDownload(stream, document.FileName, contentType);
    }

    private async Task<DomainClaim> LoadVisibleAsync(Guid claimId, CancellationToken cancellationToken)
    {
        var query = _db.Claims.Where(c => c.Id == claimId);
        query = ClaimAccess.VisibleTo(query, _currentUser);
        return await query.FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(DomainClaim), claimId);
    }

    private static async Task<byte[]> ReadHeaderAsync(Stream content, CancellationToken cancellationToken)
    {
        var header = new byte[8];
        var read = 0;
        while (read < header.Length)
        {
            var n = await content.ReadAsync(header.AsMemory(read, header.Length - read), cancellationToken);
            if (n == 0) break;
            read += n;
        }

        // Rewind so the storage writer sees the whole file. If the stream
        // cannot seek, the caller must buffer before calling us.
        if (content.CanSeek)
        {
            content.Position = 0;
        }
        else
        {
            throw new ValidationException("file", "Upload stream must be seekable.");
        }

        return header.AsSpan(0, read).ToArray();
    }

    private static bool IsDeclaredTypeMatchingHeader(string extension, byte[] header) => extension switch
    {
        ".jpg" or ".jpeg" => header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
        ".png" => header.Length >= 8
            && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47
            && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A,
        ".pdf" => header.Length >= 4
            && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46,
        _ => false
    };

    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".pdf" => "application/pdf",
        _ => "application/octet-stream"
    };
}
