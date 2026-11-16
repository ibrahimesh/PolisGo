namespace PolisGo.Domain.Exceptions;

// Thrown when a Policy is asked to transition from a state that doesn't allow
// the requested action (e.g. activating a Cancelled policy). Lives in Domain
// so the business rule travels with the entity, not the service calling it.
public class InvalidPolicyStateException : Exception
{
    public InvalidPolicyStateException(string message) : base(message) { }
}
