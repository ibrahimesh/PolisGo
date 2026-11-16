namespace PolisGo.Application.Common.Exceptions;

// Thrown when a referenced entity cannot be located. Maps to HTTP 404.
public class NotFoundException : Exception
{
    public NotFoundException(string entity, object key)
        : base($"{entity} with key '{key}' was not found.") { }

    public NotFoundException(string message) : base(message) { }
}
