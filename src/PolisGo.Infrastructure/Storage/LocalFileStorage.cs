using Microsoft.Extensions.Options;
using PolisGo.Application.Abstractions;
using PolisGo.Application.Common.Exceptions;

namespace PolisGo.Infrastructure.Storage;

// Writes under a configured root (outside wwwroot) using a server-chosen GUID
// name. We never accept a client-supplied path or filename for disk writes —
// that stops path-traversal uploads and overwrite-by-filename collisions.
public class LocalFileStorage : IFileStorage
{
    private readonly string _root;

    public LocalFileStorage(IOptions<FileStorageOptions> options)
    {
        _root = Path.IsPathRooted(options.Value.RootPath)
            ? options.Value.RootPath
            : Path.Combine(AppContext.BaseDirectory, options.Value.RootPath);
    }

    public async Task<string> SaveAsync(
        Stream content, string extension, CancellationToken cancellationToken = default)
    {
        // Extension already validated upstream; defensively re-normalise.
        var ext = extension.StartsWith('.') ? extension : "." + extension;
        var key = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var fullPath = Path.Combine(_root, key);

        try
        {
            Directory.CreateDirectory(_root);
            await using var file = File.Create(fullPath);
            await content.CopyToAsync(file, cancellationToken);
            return key;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Surface a bounded error type; the global middleware maps it to a
            // generic 500 without leaking the local path to the client.
            throw new StorageException("Failed to write uploaded file.", ex);
        }
    }

    public Task<Stream> OpenReadAsync(
        string storageKey, CancellationToken cancellationToken = default)
    {
        try
        {
            // Strip any directory components in case the key was stored with
            // separators — belt-and-braces defence against path traversal.
            var safeKey = Path.GetFileName(storageKey);
            var fullPath = Path.Combine(_root, safeKey);
            Stream stream = File.OpenRead(fullPath);
            return Task.FromResult(stream);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new StorageException("Failed to read stored file.", ex);
        }
    }

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        try
        {
            var safeKey = Path.GetFileName(storageKey);
            var fullPath = Path.Combine(_root, safeKey);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
            return Task.CompletedTask;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new StorageException("Failed to delete stored file.", ex);
        }
    }
}
