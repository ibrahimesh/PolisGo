namespace PolisGo.Domain.Entities;

public class ClaimDocument
{
    public Guid Id { get; set; }

    public Guid ClaimId { get; set; }
    public Claim Claim { get; set; } = null!;

    public string FileName { get; set; } = null!;

    // Path/URI the storage adapter uses to retrieve the blob; not a public URL.
    public string StoragePath { get; set; } = null!;

    public DateTime UploadedAt { get; set; }
}
