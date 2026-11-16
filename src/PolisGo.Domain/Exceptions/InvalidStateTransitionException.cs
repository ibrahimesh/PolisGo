namespace PolisGo.Domain.Exceptions;

// Shared across every aggregate that has a status workflow (Policy, Claim, ...).
// Carries no state-specific detail — the message is authoritative, callers map
// it uniformly to HTTP 409 Conflict.
public class InvalidStateTransitionException : Exception
{
    public InvalidStateTransitionException(string message) : base(message) { }
}
