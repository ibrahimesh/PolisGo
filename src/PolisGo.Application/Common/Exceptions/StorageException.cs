namespace PolisGo.Application.Common.Exceptions;

// Signals that a backing storage operation (disk, blob, ...) failed. Wraps
// provider-specific IOExceptions so services and the middleware can treat
// them uniformly.
public class StorageException : Exception
{
    public StorageException(string message, Exception inner) : base(message, inner) { }
    public StorageException(string message) : base(message) { }
}
