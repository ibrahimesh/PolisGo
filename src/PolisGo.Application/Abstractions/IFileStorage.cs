namespace PolisGo.Application.Abstractions;

public interface IFileStorage
{
    // Returns an opaque storage-local key (never a path the caller supplied).
    Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default);

    Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default);
}
