namespace PolisGo.Application.Common.Exceptions;

// Thrown when a request is rejected because it conflicts with current state
// (e.g. duplicate email on registration). Maps to HTTP 409.
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}
