namespace PolisGo.Application.Common.Exceptions;

// Thrown when credentials are missing or invalid. Maps to HTTP 401.
// Deliberately does not reveal whether it was the email or the password that
// was wrong — prevents account enumeration.
public class UnauthorizedException : Exception
{
    public UnauthorizedException(string message = "Invalid credentials.") : base(message) { }
}
